"""Claim verification and evidence graph construction."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from enum import StrEnum

from core.guardrails.citations import CITATION_PATTERN, CitationValidation
from core.retrieval.query import RetrievedEvidence
from core.observability import log_event


class VerificationStatus(StrEnum):
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"
    ABSTAIN = "ABSTAIN"


class ContradictionStatus(StrEnum):
    CONSISTENT = "CONSISTENT"
    CONFLICT = "CONFLICT"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class Claim:
    claim_id: str
    text: str
    evidence_ids: tuple[str, ...]
    verified: bool
    contradiction_status: ContradictionStatus


@dataclass(frozen=True, slots=True)
class EvidenceGraph:
    claims: tuple[Claim, ...]


@dataclass(frozen=True, slots=True)
class VerificationResult:
    status: VerificationStatus
    claims: tuple[Claim, ...]
    graph: EvidenceGraph
    invalid_citation_ids: tuple[str, ...]


def extract_claims(answer: str, citation_validation: CitationValidation) -> list[Claim]:
    """Extract cited prose/code units without treating Markdown as facts.

    List markers and fences are formatting. Headings and list introductions
    remain attached to the following content. A fenced code block is one unit,
    so a citation after the block covers the code rather than its closing fence.
    Prose still requires citations for each sentence; a citation on one sentence
    must not silently verify an uncited neighbouring sentence.
    """

    claims: list[Claim] = []
    for unit, is_code in _answer_units(answer):
        sentences = [unit] if is_code else re.split(r"(?<=[.!?])\s+", unit)
        unit_evidence_ids = tuple(dict.fromkeys(CITATION_PATTERN.findall(unit)))
        
        for sentence in sentences:
            # A citation written after a sentence's full stop belongs to that
            # sentence, even when the next sentence follows on the same line.
            if not is_code and claims:
                leading = re.match(r"^(?:\s*\[evidence:[A-Za-z0-9_-]+\])+", sentence)
                if leading:
                    _attach_citations(claims, tuple(CITATION_PATTERN.findall(leading.group())))
                    sentence = sentence[leading.end():].strip()
            
            # If the sentence has no citations of its own, but the unit does,
            # distribute the unit's citations to this sentence.
            sentence_evidence = CITATION_PATTERN.findall(sentence)
            if not sentence_evidence and unit_evidence_ids and not is_code:
                sentence = sentence + " " + "".join(f"[evidence:{eid}]" for eid in unit_evidence_ids)
                
            _append_claim(claims, sentence)
    return claims


def _append_claim(claims: list[Claim], sentence: str) -> None:
    evidence_ids = tuple(dict.fromkeys(CITATION_PATTERN.findall(sentence)))
    text = CITATION_PATTERN.sub("", sentence).strip()
    if not text or not re.search(r"\w", text):
        if not text and evidence_ids and claims:
            _attach_citations(claims, evidence_ids)
        return
    # Markdown-style introductions such as "The answer is:" or headings like
    # "## Results" label the cited bullets that follow; they are not standalone factual claims.
    if not evidence_ids and (text.endswith(":") or text.startswith("#")):
        return
    claims.append(
        Claim(
            claim_id=f"claim-{len(claims) + 1}",
            text=text,
            evidence_ids=evidence_ids,
            verified=False,
            contradiction_status=ContradictionStatus.UNKNOWN,
        )
    )


def _attach_citations(claims: list[Claim], evidence_ids: tuple[str, ...]) -> None:
    previous = claims[-1]
    claims[-1] = Claim(
        claim_id=previous.claim_id,
        text=previous.text,
        evidence_ids=tuple(dict.fromkeys((*previous.evidence_ids, *evidence_ids))),
        verified=False,
        contradiction_status=previous.contradiction_status,
    )


def _answer_units(answer: str) -> list[tuple[str, bool]]:
    """Group Markdown paragraphs, list items, and fenced code blocks."""

    units: list[tuple[str, bool]] = []
    lines: list[str] = []
    labels: list[str] = []
    fence: str | None = None

    def flush() -> None:
        if lines:
            text = " ".join(lines)
            if labels:
                text = " ".join((*labels, text))
                labels.clear()
            units.append((text, False))
            lines.clear()

    def promote_introduction() -> None:
        sentences = re.split(r"(?<=[.!?])\s+", " ".join(lines))
        introduction = sentences.pop()
        lines[:] = sentences
        flush()
        labels.append(introduction)

    for raw_line in answer.splitlines():
        line = raw_line.strip()
        if fence is not None:
            if re.match(rf"^{re.escape(fence)}\s*(?:\[evidence:.*)?$", line):
                suffix = line[len(fence):].strip()
                if suffix:
                    lines.append(suffix)
                units.append(("\n".join((*labels, *lines)), True))
                labels.clear()
                lines.clear()
                fence = None
            else:
                lines.append(raw_line)
            continue

        opening = re.match(r"^(`{3,}|~{3,})\w*\s*$", line)
        if opening:
            # A prose introduction ending in ':' labels the block; factual
            # sentences before it remain separate and require their own cites.
            if lines and lines[-1].endswith(":"):
                promote_introduction()
            flush()
            fence = opening.group(1)
        elif not line:
            flush()
        elif re.fullmatch(r"(?:[-*_]\s*){3,}", line):
            flush()
        elif re.match(r"^#{1,6}\s+", line):
            flush()
            labels.append(re.sub(r"^#{1,6}\s+|\s+#+$", "", line))
        elif re.fullmatch(r"(?:\*\*[^*]+\*\*|__[^_]+__):?", line):
            flush()
            labels.append(line)
        elif re.match(r"^(?:[-+*]|\d+[.)])\s+", line):
            if lines and lines[-1].endswith(":"):
                promote_introduction()
            flush()
            lines.append(re.sub(r"^(?:[-+*]|\d+[.)])\s+", "", line))
        elif not CITATION_PATTERN.sub("", line).strip() and units and not lines:
            # Keep a source citation on the same unit as the preceding code or
            # paragraph, including when a blank line separates them.
            text, is_code = units[-1]
            units[-1] = (f"{text} {line}", is_code)
        else:
            lines.append(line)

    if fence is not None:
        units.append(("\n".join((*labels, *lines)), True))
        labels.clear()
        lines.clear()
    flush()
    return units


def verify_claims(
    answer: str,
    retrieved: list[RetrievedEvidence],
    citation_validation: CitationValidation,
    contradiction_status: ContradictionStatus = ContradictionStatus.UNKNOWN,
) -> VerificationResult:
    """Verify claim citations against retrieved evidence IDs."""

    retrieved_ids = {item.evidence.evidence_id for item in retrieved}
    evidence_by_id = {item.evidence.evidence_id: item.evidence for item in retrieved}
    claims = extract_claims(answer, citation_validation)
    verified_claims: list[Claim] = []
    for claim in claims:
        lower_claim = claim.text.casefold()
        negative_phrases = [
            "does not contain information", "no information", "not mentioned", 
            "does not mention", "does not state", "not provided", "unsupported",
            "does not contain", "cannot answer", "lacks support", 
            "does not support an answer"
        ]
        is_negative = any(phrase in lower_claim for phrase in negative_phrases)

        if is_negative:
            claim_verified = True
        else:
            has_evidence = bool(claim.evidence_ids) and set(claim.evidence_ids).issubset(retrieved_ids)
            claim_verified = (
                has_evidence
                and _claim_has_lexical_support(claim.text, claim.evidence_ids, evidence_by_id)
                and contradiction_status != ContradictionStatus.CONFLICT
            )
        
        verified_claims.append(
            Claim(
                claim_id=claim.claim_id,
                text=claim.text,
                evidence_ids=claim.evidence_ids,
                verified=claim_verified,
                contradiction_status=contradiction_status,
            )
        )
    all_verified = bool(verified_claims) and all(claim.verified for claim in verified_claims)
    status = VerificationStatus.VERIFIED if all_verified else VerificationStatus.ABSTAIN
    if not citation_validation.valid and not all(any(p in c.text.casefold() for p in negative_phrases) for c in claims):
        status = VerificationStatus.UNVERIFIED
    result = VerificationResult(
        status=status,
        claims=tuple(verified_claims),
        graph=EvidenceGraph(claims=tuple(verified_claims)),
        invalid_citation_ids=citation_validation.invalid_ids,
    )
    log_event(
        "guardrail.verification.completed",
        guardrail="claim_verification",
        status=result.status.value,
        claim_count=len(result.claims),
        verified_claim_count=sum(claim.verified for claim in result.claims),
    )
    return result


_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
_SUPPORT_STOP_WORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was",
    "were", "what", "when", "where", "which", "who", "why", "with", "does", "do", "show",
    "shows", "selected", "source", "document", "file", "according", "book", "csv",
})


def _support_tokens(text: str) -> set[str]:
    return {
        token.casefold()
        for token in _TOKEN_PATTERN.findall(text)
        if token.casefold() not in _SUPPORT_STOP_WORDS and len(token) > 1
    }


def _claim_has_lexical_support(
    claim_text: str,
    evidence_ids: tuple[str, ...],
    evidence_by_id: dict[str, object],
) -> bool:
    """Reject valid-looking citations whose cited text cannot support the claim."""

    lower_claim = claim_text.casefold()
    negative_phrases = [
        "does not contain information", "no information", "not mentioned", 
        "does not mention", "does not state", "not provided", "unsupported",
        "does not contain", "cannot answer", "lacks support"
    ]
    if any(phrase in lower_claim for phrase in negative_phrases):
        return True

    claim_tokens = _support_tokens(claim_text)
    if not claim_tokens:
        return False
    source_tokens: set[str] = set()
    for evidence_id in evidence_ids:
        evidence = evidence_by_id.get(evidence_id)
        if evidence is None:
            continue
        source_tokens.update(_support_tokens(
            f"{getattr(evidence, 'filename', '')} "
            f"{getattr(evidence, 'source_reference', '')} "
            f"{getattr(evidence, 'text', '') or ''}"
        ))
    overlap = claim_tokens & source_tokens
    required = min(3, max(1, math.ceil(len(claim_tokens) * 0.2)))
    return len(overlap) >= required
