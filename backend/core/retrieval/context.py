"""Bounded context construction for the reasoning model."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

from core.retrieval.query import RetrievedEvidence


@dataclass(frozen=True, slots=True)
class EvidenceContext:
    text: str
    evidence: list[RetrievedEvidence]


def build_context(
    evidence_items: list[RetrievedEvidence],
    max_chars: int = 16000,
) -> str:
    """Build source-labelled context; retained for callers needing just text."""

    return build_evidence_context(evidence_items, max_chars).text


def build_evidence_context(
    evidence_items: list[RetrievedEvidence],
    max_chars: int = 16000,
) -> EvidenceContext:
    """Bound context and its citation ledger to the evidence actually included."""

    if max_chars <= 0:
        raise ValueError("max_chars must be positive.")

    blocks: list[str] = []
    included: list[RetrievedEvidence] = []
    context = ""
    for item in evidence_items:
        evidence = item.evidence
        if not evidence.text or not evidence.text.strip():
            continue
        safe_text = evidence.text.replace("</evidence>", "<\\/evidence>")
        block = (
            f"<evidence id=\"{escape(evidence.evidence_id, quote=True)}\" "
            f"content_type=\"{escape(evidence.content_type, quote=True)}\" "
            f"filename=\"{escape(evidence.filename, quote=True)}\" page=\"{evidence.page_number}\" "
            f"source=\"{escape(evidence.source_reference, quote=True)}\" "
            f"retrieval_score=\"{item.retrieval_score:.6f}\">\n"
            f"{safe_text}\n"
            "</evidence>"
        )
        candidate_items = [*included, item]
        ledger = "\n".join(
            f"[evidence:{entry.evidence.evidence_id}]" for entry in candidate_items
        )
        candidate = "\n\n".join(
            [f"<citation_ledger>\n{ledger}\n</citation_ledger>", *blocks, block]
        )
        if len(candidate) > max_chars:
            continue
        blocks.append(block)
        included.append(item)
        context = candidate
    return EvidenceContext(text=context, evidence=included)
