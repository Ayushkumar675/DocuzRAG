"""Tests for batch question answering and sensitive personal information handling."""

import pytest
from core.guardrails.answerability import Answerability, NO_EVIDENCE_ABSTENTION
from core.guardrails.pii import is_pii_extraction_query, SECURITY_POLICY_REFUSAL
from core.retrieval.answering import GroundedAnswerService, extract_batch_questions
from core.schemas import EvidenceRecord
from core.retrieval.query import RetrievedEvidence


def test_extract_batch_questions():
    # Bulleted batch questions
    bulleted = """- What are Transformers?
- What is the colour of the cat?
- What is the PAN number?
- What is the father's name?"""
    qs = extract_batch_questions(bulleted)
    assert len(qs) == 4
    assert qs[0] == "What are Transformers?"
    assert qs[1] == "What is the colour of the cat?"
    assert qs[2] == "What is the PAN number?"
    assert qs[3] == "What is the father's name?"

    # Numbered batch questions
    numbered = """1. What is cloud computing?
2. What is VLAN?
3. What are the debit amounts on 05/09/2026?"""
    qs2 = extract_batch_questions(numbered)
    assert len(qs2) == 3
    assert qs2[0] == "What is cloud computing?"
    assert qs2[1] == "What is VLAN?"
    assert qs2[2] == "What are the debit amounts on 05/09/2026?"

    # Inline batch questions
    inline = "What is machine learning? What is the colour of the dog? What is supervised learning?"
    qs3 = extract_batch_questions(inline)
    assert len(qs3) == 3
    assert qs3[0] == "What is machine learning?"
    assert qs3[1] == "What is the colour of the dog?"
    assert qs3[2] == "What is supervised learning?"

    # Single question should remain a single item
    single = "What is the architecture of convolutional neural networks and how are pooling layers applied?"
    qs4 = extract_batch_questions(single)
    assert len(qs4) == 1
    assert qs4[0] == single


def test_sensitive_query_detection():
    # Sensitive personal & financial queries must be identified
    assert is_pii_extraction_query("What is the PAN number?")[0] is True
    assert is_pii_extraction_query("What is the father's name?")[0] is True
    assert is_pii_extraction_query("What are the debit amounts on 05/09/2026?")[0] is True
    assert is_pii_extraction_query("Tell me the bank account number")[0] is True
    assert is_pii_extraction_query("What is the Aadhaar card number?")[0] is True

    # Benign factual queries must NOT be blocked
    assert is_pii_extraction_query("What are Transformers?")[0] is False
    assert is_pii_extraction_query("What is the colour of the cat?")[0] is False
    assert is_pii_extraction_query("What is the colour of the dog?")[0] is False
    assert is_pii_extraction_query("What is the name of the university?")[0] is False
    assert is_pii_extraction_query("What is cloud computing?")[0] is False
    assert is_pii_extraction_query("What is VLAN?")[0] is False
    assert is_pii_extraction_query("What is supervised learning?")[0] is False
    assert is_pii_extraction_query("What is the text shown in the image?")[0] is False
    assert is_pii_extraction_query("What is machine learning?")[0] is False


def test_batch_answering_pii_isolation_and_grounding():
    # Mock evidence records
    cat_evidence = EvidenceRecord(
        evidence_id="ev-cat",
        collection_id="col-1",
        document_id="doc-cat",
        filename="cat.jpg",
        page_number=1,
        content_type="IMAGE",
        source_reference="cat.jpg#page=1",
        score=0.9,
        text="The image shows an orange tabby cat resting on a mat.",
        image_reference=None,
        section=None,
        metadata={},
    )
    vlan_evidence = EvidenceRecord(
        evidence_id="ev-vlan",
        collection_id="col-1",
        document_id="doc-vlan",
        filename="network.pdf",
        page_number=3,
        content_type="TEXT",
        source_reference="network.pdf#page=3",
        score=0.95,
        text="A Virtual Local Area Network (VLAN) partitions physical network switches into logical broadcast domains.",
        image_reference=None,
        section="Networking",
        metadata={},
    )

    class MockBatchRetriever:
        def retrieve(self, collection_id, question, selected_document_ids, top_k):
            q_lower = question.lower()
            if "cat" in q_lower:
                return [RetrievedEvidence(cat_evidence, retrieval_score=0.9)]
            if "vlan" in q_lower:
                return [RetrievedEvidence(vlan_evidence, retrieval_score=0.95)]
            return []

    class MockBatchReasoning:
        def answer(self, question, context):
            if "cat" in question.lower():
                return "- **Cat Colour**: The cat is orange with a tabby pattern [evidence:ev-cat]."
            if "vlan" in question.lower():
                return "- **VLAN**: A Virtual Local Area Network partitions physical switches into broadcast domains [evidence:ev-vlan]."
            return "The selected evidence does not support an answer."

    service = GroundedAnswerService(retriever=MockBatchRetriever(), reasoning_client=MockBatchReasoning())

    batch_query = """- What is the colour of the cat?
- What is the PAN number?
- What is VLAN?
- What are the debit amounts on 05/09/2026?
- What is the quantum teleportation protocol?"""

    result = service.answer(collection_id="col-1", question=batch_query, selected_document_ids=None, top_k=3)

    # 1. Overall result must be partially supported (some supported, some unsupported/refused)
    assert result.answerability == Answerability.PARTIALLY_SUPPORTED
    assert result.response_mode == "llm_structured"

    # 2. Both factual supported answers must be present with their citations
    assert "What is the colour of the cat?" in result.answer
    assert "orange" in result.answer
    assert "[evidence:ev-cat]" in result.answer

    assert "What is VLAN?" in result.answer
    assert "Virtual Local Area Network" in result.answer
    assert "[evidence:ev-vlan]" in result.answer

    # 3. Both sensitive PII questions must contain the Security Policy exception without breaking others
    assert "What is the PAN number?" in result.answer
    assert "DocuNova Security Policy" in result.answer
    assert "What are the debit amounts on 05/09/2026?" in result.answer

    # 4. Genuinely unsupported question must receive the appropriate unsupported message
    assert "What is the quantum teleportation protocol?" in result.answer
    assert "The selected evidence does not support an answer" in result.answer

    # 5. Evidence shelf must contain the evidence chunks for cat and vlan
    ev_ids = [e.evidence.evidence_id for e in result.retrieved_evidence]
    assert "ev-cat" in ev_ids
    assert "ev-vlan" in ev_ids
