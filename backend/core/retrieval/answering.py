"""Retrieval → bounded context → LLM synthesis → verified response."""

from __future__ import annotations

from dataclasses import dataclass, replace
import re

from core.config import ConfigurationError
from core.guardrails.answerability import NO_EVIDENCE_ABSTENTION, Answerability
from core.guardrails.citations import CitationValidation, validate_citations
from core.guardrails.contradictions import Contradiction, detect_contradictions
from core.guardrails.injection import assess_document_content
from core.guardrails.secrets import contains_secret_pattern
from core.guardrails.pii import (
    is_pii_extraction_query,
    redact_pii,
    contains_pii,
    is_sensitive_identity_or_secret_passage,
    SECURITY_POLICY_REFUSAL,
)

from core.guardrails.verification import (
    Claim, EvidenceGraph, VerificationResult, VerificationStatus, verify_claims,
)
from core.llm.nvidia_reasoning import NvidiaReasoningClient, ReasoningServiceError
from core.observability import log_event, log_span
from core.retrieval.context import build_evidence_context
from core.retrieval.fusion import fuse_evidence
from core.retrieval.query import RetrievedEvidence


QUERY_GUARDRAILS = (
    "collection_scope", "selected_document_scope", "pii_screening",
    "prompt_injection_detection", "secret_screening", "bounded_context",
    "contradiction_detection", "citation_validation", "claim_verification",
    "answerability_check",
)



@dataclass(frozen=True, slots=True)
class AnswerResult:
    answer: str
    answerability: Answerability
    verified: bool
    citations: tuple[str, ...]
    retrieved_evidence: list[RetrievedEvidence]
    citation_validation: CitationValidation | None
    claims: tuple[Claim, ...] = ()
    evidence_graph: EvidenceGraph | None = None
    contradictions: tuple[Contradiction, ...] = ()
    verification_issues: tuple[str, ...] = ()
    guardrails_invoked: tuple[str, ...] = ()
    services_invoked: tuple[str, ...] = ()
    response_mode: str = "llm_structured"


def extract_batch_questions(raw_text: str) -> list[str]:
    """Extract individual questions when a user submits a batch of questions."""
    if not raw_text:
        return []

    raw = raw_text.strip()

    # 1. First attempt: Line-by-line parsing
    lines = [line.strip() for line in raw.split("\n") if line.strip()]
    if len(lines) >= 2:
        extracted: list[str] = []
        for line in lines:
            # Strip list / bullet prefixes like "1. ", "1) ", "- ", "* ", "• "
            cleaned = re.sub(r"^(?:(?:\d+[.)])|[-*•+])\s+", "", line).strip()
            if cleaned and len(cleaned) >= 3:
                extracted.append(cleaned)

        question_count = sum(
            1 for item in extracted
            if item.endswith("?") or re.match(
                r"(?i)^(what|how|why|where|when|who|which|is|are|can|could|tell|explain|describe|show|find|list|give)",
                item,
            )
        )
        if question_count >= 2:
            return extracted

    # 2. Second attempt: Inline questions separated by '?' followed by capital letter or numbering
    inline_split = [
        q.strip()
        for q in re.split(r"(?<=\?)\s+(?=[A-Z0-9\"'•\-])", raw)
        if q.strip()
    ]
    if len(inline_split) >= 2:
        cleaned_inline = [
            re.sub(r"^(?:(?:\d+[.)])|[-*•+])\s+", "", q).strip()
            for q in inline_split
        ]
        valid_inline = [q for q in cleaned_inline if q and len(q) >= 3]
        if len(valid_inline) >= 2:
            return valid_inline

    return [raw]


class GroundedAnswerService:
    """Always synthesize answers through the LLM; never substitute database text."""

    def __init__(self, retriever: object, reasoning_client: NvidiaReasoningClient,
                 max_context_chars: int = 16000) -> None:
        self.retriever = retriever
        self.reasoning_client = reasoning_client
        self.max_context_chars = max_context_chars

    def answer(self, collection_id: str, question: str,
               selected_document_ids: list[str] | None, top_k: int) -> AnswerResult:
        with log_span("query.pipeline", service="grounded_answer_service", collection_id=collection_id):
            questions = extract_batch_questions(question)
            if len(questions) > 1:
                return self._answer_batch(collection_id, questions, selected_document_ids, top_k)
            return self._answer_single(collection_id, question, selected_document_ids, top_k)

    def _answer_batch(
        self,
        collection_id: str,
        questions: list[str],
        selected_document_ids: list[str] | None,
        top_k: int,
    ) -> AnswerResult:
        all_answers: list[str] = []
        all_retrieved_evidence: list[RetrievedEvidence] = []
        seen_evidence_ids: set[str] = set()
        all_citations: list[str] = []
        all_claims: list[Claim] = []
        all_contradictions: list[Contradiction] = []
        all_issues: list[str] = []
        all_guardrails: list[str] = ["collection_scope", "selected_document_scope", "pii_screening"]
        all_services: list[str] = ["scope_validator", "retrieval_service", "reranker", "llm_reasoning_service"]

        supported_count = 0

        for q in questions:
            clean_q = q.strip()
            # 1. Proactively screen question for sensitive personal/financial data
            is_pii, _ = is_pii_extraction_query(clean_q)
            if is_pii:
                all_guardrails.append("pii_query_guardrail")
                all_issues.append(f"Query '{clean_q[:50]}' requested restricted personal or financial data.")
                all_answers.append(
                    f"- **{clean_q}**: **DocuNova Security Policy**: Access to sensitive personal or financial information "
                    "(such as Aadhaar card details, PAN card numbers, bank statements, passbooks, account numbers, "
                    "transactions, passwords, and credentials) is strictly restricted to protect user privacy and confidentiality."
                )
                continue

            # 2. Answer question independently using the selected source documents
            single_res = self._answer_single(
                collection_id=collection_id,
                question=clean_q,
                selected_document_ids=selected_document_ids,
                top_k=top_k,
            )

            # Aggregate guardrails, services, contradictions, claims, issues
            all_guardrails.extend(single_res.guardrails_invoked)
            all_services.extend(single_res.services_invoked)
            all_claims.extend(single_res.claims)
            all_contradictions.extend(single_res.contradictions)
            all_issues.extend(single_res.verification_issues)

            # Aggregate evidence deduplicating by evidence_id
            for ev_item in single_res.retrieved_evidence:
                ev_id = ev_item.evidence.evidence_id
                if ev_id not in seen_evidence_ids:
                    seen_evidence_ids.add(ev_id)
                    all_retrieved_evidence.append(ev_item)

            for cit in single_res.citations:
                if cit not in all_citations:
                    all_citations.append(cit)

            # Format the question's answer cleanly into structured bullet format
            raw_answer = (single_res.answer or "").strip()
            if (
                single_res.answerability == Answerability.NOT_SUPPORTED
                or not raw_answer
                or raw_answer == NO_EVIDENCE_ABSTENTION
            ):
                all_answers.append(f"- **{clean_q}**: The selected evidence does not support an answer.")
            elif raw_answer == SECURITY_POLICY_REFUSAL or single_res.response_mode == "abstention":
                all_answers.append(
                    f"- **{clean_q}**: **DocuNova Security Policy**: Access to sensitive personal or financial information "
                    "(such as Aadhaar card details, PAN card numbers, bank statements, passbooks, account numbers, "
                    "transactions, passwords, and credentials) is strictly restricted to protect user privacy and confidentiality."
                )
            else:
                supported_count += 1
                ans_lines = [ln.strip() for ln in raw_answer.split("\n") if ln.strip()]
                if len(ans_lines) == 1:
                    line_clean = re.sub(r"^[-*•+]\s+", "", ans_lines[0])
                    all_answers.append(f"- **{clean_q}**: {line_clean}")
                else:
                    sub_bullets: list[str] = []
                    for ln in ans_lines:
                        sub_clean = re.sub(r"^[-*•+]\s+", "", ln)
                        sub_bullets.append(f"  - {sub_clean}")
                    all_answers.append(f"- **{clean_q}**:\n" + "\n".join(sub_bullets))

        combined_answer = "\n".join(all_answers)

        if supported_count == len(questions):
            overall_answerability = Answerability.SUPPORTED
        elif supported_count > 0:
            overall_answerability = Answerability.PARTIALLY_SUPPORTED
        else:
            overall_answerability = Answerability.NOT_SUPPORTED

        is_verified = (
            supported_count > 0
            and all(c.verified for c in all_claims)
            if all_claims else (supported_count > 0)
        )

        return AnswerResult(
            answer=combined_answer,
            answerability=overall_answerability,
            verified=is_verified,
            citations=tuple(dict.fromkeys(all_citations)),
            retrieved_evidence=all_retrieved_evidence,
            citation_validation=None,
            claims=tuple(all_claims),
            evidence_graph=None,
            contradictions=tuple(all_contradictions),
            verification_issues=tuple(dict.fromkeys(all_issues)),
            guardrails_invoked=tuple(dict.fromkeys(all_guardrails)),
            services_invoked=tuple(dict.fromkeys(all_services)),
            response_mode="llm_structured" if supported_count > 0 else "abstention",
        )

    def _answer_single(self, collection_id: str, question: str,
                       selected_document_ids: list[str] | None, top_k: int) -> AnswerResult:
        guardrails = ["collection_scope", "selected_document_scope", "pii_screening"]
        services = ["scope_validator", "retrieval_service", "reranker"]
        log_event("query.started", service="grounded_answer_service", status="retrieving", top_k=top_k)

        # Proactively block attempts to query sensitive personal or financial identifiers
        is_pii_query, refusal_msg = is_pii_extraction_query(question)
        if is_pii_query:
            guardrails.append("pii_query_guardrail")
            log_event("guardrail.pii_screening.completed", guardrail="pii_screening", status="blocked")
            return AnswerResult(
                answer=refusal_msg,
                answerability=Answerability.NOT_SUPPORTED,
                verified=False,
                citations=(),
                retrieved_evidence=[],
                citation_validation=None,
                claims=(),
                evidence_graph=None,
                contradictions=(),
                verification_issues=("Query requested restricted personal or financial identifiers.",),
                guardrails_invoked=tuple(dict.fromkeys(guardrails)),
                services_invoked=tuple(dict.fromkeys(services)),
                response_mode="abstention",
            )

        retrieved = self.retriever.retrieve(
            collection_id=collection_id, question=question,
            selected_document_ids=selected_document_ids, top_k=top_k,
        )

        def finish(answer: str, answerability: Answerability, *, mode: str,
                   verified: bool = False, validation: CitationValidation | None = None,
                   verification: VerificationResult | None = None,
                   contradictions: tuple[Contradiction, ...] = (),
                   issues: tuple[str, ...] = ()) -> AnswerResult:
            guardrails.append("answerability_check")
            log_event("guardrail.answerability.completed", guardrail="answerability_check",
                      status=answerability.value)
            log_event("query.completed", service="grounded_answer_service", status=answerability.value,
                      response_mode=mode, evidence_count=len(retrieved), verified=verified)
            # Ensure answer and any returned retrieved evidence are sanitized of raw PII
            clean_answer = redact_pii(answer) if answer else answer
            clean_evidence = []
            for item in retrieved:
                if is_sensitive_identity_or_secret_passage(item.evidence):
                    continue
                if item.evidence.text and contains_pii(item.evidence.text):
                    clean_record = replace(item.evidence, text=redact_pii(item.evidence.text))
                    clean_evidence.append(replace(item, evidence=clean_record))
                else:
                    clean_evidence.append(item)
            return AnswerResult(
                answer=clean_answer, answerability=answerability, verified=verified,
                citations=validation.citation_ids if validation and validation.valid else (),
                retrieved_evidence=clean_evidence, citation_validation=validation,
                claims=verification.claims if verification else (),
                evidence_graph=verification.graph if verification else None,
                contradictions=contradictions, verification_issues=issues,
                guardrails_invoked=tuple(dict.fromkeys(guardrails)),
                services_invoked=tuple(dict.fromkeys(services)), response_mode=mode,
            )

        if not retrieved:
            return finish(NO_EVIDENCE_ABSTENTION, Answerability.NOT_SUPPORTED, mode="abstention")

        services.append("evidence_fusion")
        retrieved = [item.evidence for item in fuse_evidence(retrieved)]
        guardrails.extend(("prompt_injection_detection", "secret_screening", "pii_screening"))
        # Instructions in sources remain untrusted. Secret-bearing passages and
        # personal identity documents (Aadhaar, PAN, Passbook) are excluded from
        # both model context and source previews.
        safe_retrieved = []
        blocked_identity_count = 0
        for item in retrieved:
            assess_document_content(item.evidence.text or "")
            if is_sensitive_identity_or_secret_passage(item.evidence):
                blocked_identity_count += 1
                continue
            if contains_secret_pattern(item.evidence.text or ""):
                blocked_identity_count += 1
                continue
            # Sanitize any residual PII before sending to context builder
            if item.evidence.text and contains_pii(item.evidence.text):
                clean_rec = replace(item.evidence, text=redact_pii(item.evidence.text))
                safe_retrieved.append(replace(item, evidence=clean_rec))
            else:
                safe_retrieved.append(item)
        retrieved = safe_retrieved
        services.append("context_builder")
        guardrails.append("bounded_context")
        context = build_evidence_context(retrieved, max_chars=self.max_context_chars)
        retrieved = context.evidence
        if not retrieved:
            if blocked_identity_count > 0:
                return finish(
                    SECURITY_POLICY_REFUSAL,
                    Answerability.NOT_SUPPORTED,
                    mode="abstention",
                    issues=("Retrieved sources contain restricted personal identity records (Aadhaar/PAN/Passbook).",)
                )
            return finish(NO_EVIDENCE_ABSTENTION, Answerability.NOT_SUPPORTED, mode="abstention",
                          issues=("No safe textual evidence fits the reasoning context.",))


        guardrails.append("contradiction_detection")
        contradictions = tuple(detect_contradictions([item.evidence for item in retrieved]))
        conflicts = tuple(item for item in contradictions if item.status.value == "CONFLICT")
        llm_question = question
        if conflicts:
            llm_question += (
                "\nThe sources contain conflicting numeric statements. Describe each source's "
                "value with its citation, and explain that the conflict is unresolved. "
                "Never silently select one value."
            )

        services.append("llm_reasoning_service")
        try:
            with log_span("llm.synthesis", evidence_count=len(retrieved)):
                generated = self.reasoning_client.answer(llm_question, context.text)
                generated = re.sub(r"\[evidence:(?i:none|n/a|null|false|empty)\]", "", generated)
        except (ConfigurationError, ReasoningServiceError) as error:
            return finish(
                "Retrieved sources are available, but the LLM could not structure an answer. "
                "Configure working NVIDIA reasoning access and retry.",
                Answerability.NOT_SUPPORTED, mode="llm_unavailable", contradictions=contradictions,
                issues=(str(error),),
            )

        if generated.strip() == "The selected evidence does not support an answer.":
            return finish(generated, Answerability.NOT_SUPPORTED, mode="abstention")

        guardrails.extend(("citation_validation", "claim_verification"))
        services.append("verification_service")
        retrieved_ids = {item.evidence.evidence_id for item in retrieved}
        validation = validate_citations(generated, retrieved_ids)
        verification = verify_claims(generated, retrieved, validation)
        if generated.strip() == "The selected evidence does not support an answer.":
            return finish(generated, Answerability.NOT_SUPPORTED, mode="abstention")
        if verification.status != VerificationStatus.VERIFIED or contains_secret_pattern(generated):
            try:
                with log_span("llm.verification_retry"):
                    generated = self.reasoning_client.answer(
                        _citation_retry_question(llm_question, verification, validation), context.text,
                    )
                    generated = re.sub(r"\[evidence:(?i:none|n/a|null|false|empty)\]", "", generated)
                validation = validate_citations(generated, retrieved_ids)
                verification = verify_claims(generated, retrieved, validation)
            except (ConfigurationError, ReasoningServiceError):
                return finish("The LLM answer failed verification and its retry was unavailable.",
                              Answerability.NOT_SUPPORTED, mode="verification_failed",
                              contradictions=contradictions,
                              issues=("Reasoning provider failed during the verification retry.",))
        if verification.status != VerificationStatus.VERIFIED or contains_secret_pattern(generated):
            # Distinguish between hallucination (invalid citations, no verified claims) and
            # citation placement issues (valid citations present but not per-sentence/bullet).
            # The nemotron-ultra model groups citations at paragraph end rather than per-bullet.
            # When the answer is genuinely grounded — valid citations, at least one verified
            # claim, no fabricated IDs, no secrets — accept it as PARTIALLY_SUPPORTED rather
            # than silently discarding a correct grounded answer.
            issues = _verification_issues(verification, validation)
            verified_claim_count = sum(1 for c in verification.claims if c.verified)
            is_citation_placement_issue = (
                not contains_secret_pattern(generated)
                and validation.valid           # citations present and all IDs are real
                and not validation.invalid_ids # no fabricated evidence IDs
                and verified_claim_count > 0   # at least one claim fully verified
            )
            if is_citation_placement_issue:
                return finish(
                    generated,
                    Answerability.PARTIALLY_SUPPORTED,
                    mode="llm_structured",
                    verified=False,
                    validation=validation,
                    verification=verification,
                    contradictions=contradictions,
                    issues=issues + ("Some statements lack per-sentence citations; "
                                     "answer is grounded but not fully verified.",),
                )
            return finish("The LLM response could not be verified against the retrieved sources. "
                          "Try a more specific question.", Answerability.NOT_SUPPORTED,
                           mode="verification_failed", validation=validation,
                           contradictions=contradictions,
                          issues=issues)

        return finish(
            generated, Answerability.PARTIALLY_SUPPORTED if conflicts else Answerability.SUPPORTED,
            mode="llm_structured", verified=not bool(conflicts), validation=validation,
            verification=verification, contradictions=contradictions,
            issues=("Conflicting source values remain unresolved.",) if conflicts else (),
        )


def _citation_retry_question(question: str, verification: VerificationResult,
                             validation: CitationValidation) -> str:
    feedback = _verification_issues(verification, validation)
    if not feedback:
        feedback = (
            "The answer contains a grounded statement without complete per-statement "
            "citation coverage. Some statements have no supporting citations.",
        )
    return (
        "Your previous answer failed verification because some statements had no supporting citations. "
        "Rewrite the entire answer in a structured, easy-to-read bullet-point format, placing [evidence:ID] citations "
        "immediately at the end of EVERY individual bullet point and nested sub-bullet. "
        "Use **bold formatting** for key terms. Do not group citations at the end of a paragraph. "
        "Use only IDs from the citation ledger. Never fabricate IDs.\n\n"
        "Correct format:\n"
        "- **Training Duration**: The model trains for 50 epochs. [evidence:abc-123]\n"
        "- **Cross-Source Evaluation**: Evaluated across both benchmarks. [evidence:abc-123][evidence:def-456]\n"
        "  - **Sub-Metric**: Top-5 error is 3.1%. [evidence:abc-123]\n\n"
        f"Original question: {question}\n"
        f"Verification feedback: {' '.join(feedback)}"
    )


def _verification_issues(verification: VerificationResult,
                         validation: CitationValidation) -> tuple[str, ...]:
    issues = []
    if not validation.citation_ids:
        issues.append("The generated response contains no evidence citations.")
    if validation.invalid_ids:
        issues.append("The generated response cites sources not supplied in the reasoning context.")
    if any(not claim.evidence_ids for claim in verification.claims):
        issues.append("Some answer statements or code blocks have no supporting citations.")
    if not verification.claims:
        issues.append("The generated response contains no verifiable answer statements.")
    return tuple(issues)
