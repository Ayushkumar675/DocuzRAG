from dataclasses import replace
from uuid import uuid4

import pytest

from core.config import ConfigurationError
from core.guardrails.citations import validate_citations
from core.guardrails.scope import ScopeViolationError
from core.guardrails.verification import VerificationStatus, verify_claims
from core.llm.nvidia_reasoning import ReasoningServiceError
from core.retrieval.answering import GroundedAnswerService
from core.retrieval.context import build_evidence_context
from core.llm.nvidia_embeddings import EmbeddingServiceError
from core.retrieval.hybrid import HybridRetriever
from core.retrieval.query import RetrievedEvidence
from core.retrieval.reranking import LexicalReranker, RerankedRetriever
from core.schemas import DocumentRecord, EvidenceRecord
from core.storage.metadata_store import MetadataStore


@pytest.fixture
def evidence():
    source_id = str(uuid4())
    record = EvidenceRecord(
        evidence_id=source_id,
        collection_id=str(uuid4()),
        document_id=str(uuid4()),
        filename=f"{uuid4()}.pdf",
        page_number=1,
        content_type="TEXT",
        source_reference=f"document:{uuid4()}#page=1",
        score=None,
        text="The guide covers retrieving records and SQL joins.",
        image_reference=None,
        section=None,
        metadata={},
    )
    return RetrievedEvidence(record, retrieval_score=0.8)


@pytest.mark.parametrize("template", [
    "1. The guide covers joins. [evidence:{id}]\n2. It covers retrieval. [evidence:{id}]",
    "## Summary\nThe guide covers joins. [evidence:{id}]",
    "**Topics**\n- The guide covers joins. [evidence:{id}]",
    "The guide covers joins. [evidence:{id}] It covers retrieval. [evidence:{id}]",
    "The guide covers joins [evidence:{id}].",
    "The guide covers joins.\n\n[evidence:{id}]",
    "SQL query:\n```sql\nSELECT value\nFROM records;\n```\n[evidence:{id}]",
    "~~~sql\nSELECT value FROM records;\n~~~ [evidence:{id}]",
])
def test_markdown_formatting_does_not_create_uncited_claims(evidence, template):
    answer = template.format(id=evidence.evidence.evidence_id)
    validation = validate_citations(answer, {evidence.evidence.evidence_id})
    result = verify_claims(answer, [evidence], validation)
    assert result.status == VerificationStatus.VERIFIED
    assert all(claim.evidence_ids == (evidence.evidence.evidence_id,) for claim in result.claims)


@pytest.mark.parametrize("template", [
    "An uncited assertion. A cited assertion. [evidence:{id}]",
    "An uncited assertion. SQL query:\n```sql\nSELECT value FROM records;\n```\n[evidence:{id}]",
    "1. An uncited assertion.\n2. A cited assertion. [evidence:{id}]",
    "An uncited assertion [evidence:not-in-context].",
])
def test_real_uncited_statements_and_unknown_sources_are_rejected(evidence, template):
    answer = template.format(id=evidence.evidence.evidence_id)
    validation = validate_citations(answer, {evidence.evidence.evidence_id})
    result = verify_claims(answer, [evidence], validation)
    assert result.status != VerificationStatus.VERIFIED
    assert any(not claim.verified for claim in result.claims)


class StubRetriever:
    def __init__(self, evidence):
        self.evidence = evidence

    def retrieve(self, **kwargs):
        return self.evidence


class StubReasoner:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []

    def answer(self, question, context):
        self.calls.append((question, context))
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


def test_valid_formatted_answer_passes_on_first_attempt(evidence):
    answer = f"## Topics\n1. The guide covers joins. [evidence:{evidence.evidence.evidence_id}]"
    reasoner = StubReasoner(answer)
    service = GroundedAnswerService(StubRetriever([evidence]), reasoner)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert result.answer == answer
    assert result.verified
    assert len(reasoner.calls) == 1


def test_retry_covers_valid_citations_with_missing_claim_coverage(evidence):
    citation = f"[evidence:{evidence.evidence.evidence_id}]"
    draft = f"An uncited assertion. The guide covers joins. {citation}"
    repaired = f"The guide covers joins. {citation}"
    reasoner = StubReasoner(draft, repaired)
    service = GroundedAnswerService(StubRetriever([evidence]), reasoner)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert result.verified
    assert result.answer == repaired
    assert len(reasoner.calls) == 2
    assert "no supporting citations" in reasoner.calls[1][0]
    assert draft not in reasoner.calls[1][0]


def test_persistent_failure_is_not_relabelled_as_a_supported_answer(evidence):
    reasoner = StubReasoner("No citations.", "Still no citations.")
    service = GroundedAnswerService(StubRetriever([evidence]), reasoner)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert "could not be verified" in result.answer
    assert result.answerability.value == "NOT_SUPPORTED"
    assert not result.verified
    assert result.citations == ()
    assert result.response_mode == "verification_failed"
    assert "no evidence citations" in " ".join(result.verification_issues)


def test_retry_provider_failure_retains_verification_diagnostics(evidence):
    reasoner = StubReasoner("No citations.", ReasoningServiceError("Provider unavailable."))
    service = GroundedAnswerService(StubRetriever([evidence]), reasoner)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert not result.verified
    assert "failed during the verification retry" in " ".join(result.verification_issues)


def test_missing_key_returns_scoped_source_context(evidence):
    reasoner = StubReasoner(ConfigurationError("Key is missing."))
    service = GroundedAnswerService(StubRetriever([evidence]), reasoner)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert result.answerability.value == "NOT_SUPPORTED"
    assert evidence.evidence.evidence_id in {
        item.evidence.evidence_id for item in result.retrieved_evidence
    }
    assert result.response_mode == "llm_unavailable"
    assert "Key is missing" in " ".join(result.verification_issues)


def test_context_ledger_only_contains_included_evidence(evidence):
    excluded = replace(evidence, evidence=replace(
        evidence.evidence, evidence_id=str(uuid4()), text="oversized " * 2000,
    ))
    context = build_evidence_context([excluded, evidence], max_chars=1000)
    assert context.evidence == [evidence]
    assert len(context.text) <= 1000
    assert excluded.evidence.evidence_id not in context.text
    assert evidence.evidence.evidence_id in context.text


def test_citation_to_retrieved_but_omitted_source_is_rejected(evidence):
    excluded = replace(evidence, evidence=replace(
        evidence.evidence, evidence_id=str(uuid4()), text="oversized " * 2000,
    ))
    reasoner = StubReasoner(*[f"A fact. [evidence:{excluded.evidence.evidence_id}]"] * 2)
    service = GroundedAnswerService(StubRetriever([excluded, evidence]), reasoner, max_context_chars=1000)
    result = service.answer(evidence.evidence.collection_id, "Summarize the guide", None, 5)
    assert not result.verified
    assert excluded.evidence.evidence_id in result.citation_validation.invalid_ids


def test_keyword_retrieval_keeps_collection_and_document_scope(tmp_path, evidence):
    metadata = MetadataStore(tmp_path / "metadata.db")
    collections = [metadata.create_collection(str(uuid4())) for _ in range(2)]
    records = []
    for collection in collections:
        document_id = str(uuid4())
        metadata.add_document(DocumentRecord(
            id=document_id, collection_id=collection.id, filename=f"{document_id}.txt",
            file_type="txt", size=100, page_count=None, status="processed",
            created_at=collection.created_at, storage_path=f"{document_id}.txt",
        ))
        record = replace(evidence.evidence, evidence_id=str(uuid4()),
                         collection_id=collection.id, document_id=document_id)
        records.append(record)
        metadata.add_evidence(record)
    retriever = RerankedRetriever(
        HybridRetriever(metadata, None, None, mode="keyword"), LexicalReranker(),
    )
    result = retriever.retrieve(collections[0].id, "joins", [records[0].document_id], 5)
    assert [item.evidence.evidence_id for item in result] == [records[0].evidence_id]
    with pytest.raises(ScopeViolationError):
        retriever.retrieve(collections[0].id, "joins", [records[1].document_id], 5)


def test_hybrid_retrieval_falls_back_to_scoped_keyword_search(tmp_path, evidence):
    class BrokenEmbedder:
        def embed_texts(self, texts, input_type="query"):
            raise EmbeddingServiceError("provider unavailable")

    metadata = MetadataStore(tmp_path / "metadata.db")
    collection = metadata.create_collection("generic collection")
    document_id = str(uuid4())
    metadata.add_document(DocumentRecord(
        id=document_id, collection_id=collection.id, filename="source.pdf",
        file_type="pdf", size=100, page_count=1, status="processed",
        created_at=collection.created_at, storage_path="source.pdf",
    ))
    record = replace(evidence.evidence, collection_id=collection.id, document_id=document_id)
    metadata.add_evidence(record)
    retriever = HybridRetriever(metadata, BrokenEmbedder(), None, mode="hybrid")
    result = retriever.retrieve(collection.id, "retrieving records", [document_id], 5)
    assert [item.evidence.evidence_id for item in result] == [record.evidence_id]


def test_multi_document_retrieval_keeps_each_selected_source(tmp_path, evidence):
    metadata = MetadataStore(tmp_path / "metadata.db")
    collection = metadata.create_collection("multi source collection")
    records = []
    for name, text in (("first.txt", "alpha source"), ("second.txt", "beta source")):
        document_id = str(uuid4())
        metadata.add_document(DocumentRecord(
            id=document_id, collection_id=collection.id, filename=name,
            file_type="txt", size=100, page_count=None, status="processed",
            created_at=collection.created_at, storage_path=name,
        ))
        record = replace(
            evidence.evidence, evidence_id=str(uuid4()), collection_id=collection.id,
            document_id=document_id, filename=name, text=text,
        )
        metadata.add_evidence(record)
        records.append(record)
    retriever = RerankedRetriever(
        HybridRetriever(metadata, None, None, mode="keyword"), LexicalReranker(),
    )
    result = retriever.retrieve(
        collection.id, "alpha", [record.document_id for record in records], 2,
    )
    assert {item.evidence.document_id for item in result} == {
        record.document_id for record in records
    }
