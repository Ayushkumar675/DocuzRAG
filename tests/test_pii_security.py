"""Comprehensive security tests for Personal Identifiable Information (PII) and financial data protection."""

import pytest
from core.guardrails.pii import (
    contains_pii,
    contains_high_risk_pii,
    detect_pii_types,
    redact_pii,
    is_pii_extraction_query,
    SECURITY_POLICY_REFUSAL,
)
from core.guardrails.secrets import contains_secret_pattern
from core.ingestion.parser import ParsedItem
from core.ingestion.chunker import chunk_item


def test_aadhaar_card_detection_and_redaction():
    # Standard 12-digit Indian Aadhaar format
    sample_text = "The applicant Aadhaar is 2345 6789 0123 as registered with UIDAI."
    assert contains_pii(sample_text) is True
    assert "aadhaar" in detect_pii_types(sample_text)
    assert contains_high_risk_pii(sample_text) is True
    assert contains_secret_pattern(sample_text) is True

    redacted = redact_pii(sample_text)
    assert "2345 6789 0123" not in redacted
    assert "[REDACTED_AADHAAR]" in redacted

    # Hyphenated Aadhaar
    hyphenated = "UID No: 4567-8901-2345"
    assert contains_pii(hyphenated) is True
    assert "[REDACTED_AADHAAR]" in redact_pii(hyphenated)


def test_pan_card_detection_and_redaction():
    # Indian Permanent Account Number (PAN)
    sample_pan = "Taxpayer PAN number is ABCDE1234F registered with the Income Tax Department."
    assert contains_pii(sample_pan) is True
    assert "pan" in detect_pii_types(sample_pan)
    assert contains_high_risk_pii(sample_pan) is True
    assert contains_secret_pattern(sample_pan) is True

    redacted = redact_pii(sample_pan)
    assert "ABCDE1234F" not in redacted
    assert "[REDACTED_PAN]" in redacted


def test_bank_passbook_and_account_details_redaction():
    # Bank passbook details
    passbook_text = (
        "State Bank of India Passbook. Account Number: 12345678901234. "
        "CIF Number: 9876543210. IFSC Code: SBIN0001234. Branch: Connaught Place."
    )
    assert contains_pii(passbook_text) is True
    pii_types = detect_pii_types(passbook_text)
    assert "bank_account" in pii_types
    assert "ifsc" in pii_types
    assert contains_secret_pattern(passbook_text) is True

    redacted = redact_pii(passbook_text)
    assert "12345678901234" not in redacted
    assert "[REDACTED_ACCOUNT]" in redacted



def test_password_and_credential_protection():
    credential_text = "Server root credentials: password: MySuperSecretPassword123! and api_key: nvapi-secretkeytoken"
    assert contains_pii(credential_text) is True
    assert contains_secret_pattern(credential_text) is True

    redacted = redact_pii(credential_text)
    assert "MySuperSecretPassword123!" not in redacted
    assert "[REDACTED_PASSWORD]" in redacted


def test_contact_details_protection():
    contact_text = "Customer email: user.name@domain.com, mobile: 9876543210."
    assert contains_pii(contact_text) is True
    types = detect_pii_types(contact_text)
    assert "email" in types
    assert "phone" in types

    redacted = redact_pii(contact_text)
    assert "user.name@domain.com" not in redacted
    assert "9876543210" not in redacted


def test_pii_query_intent_screening():
    # Malicious or direct queries attempting to retrieve personal data
    prohibited_queries = [
        "What is the Aadhaar card number in the document?",
        "Tell me the user's Aadhaar number",
        "Give me the PAN card number",
        "What is the bank account number in the passbook?",
        "Extract all passwords from the uploaded file",
        "Show me the secret key or credential",
    ]
    for query in prohibited_queries:
        is_blocked, refusal = is_pii_extraction_query(query)
        assert is_blocked is True, f"Query '{query}' was not blocked!"
        assert refusal == SECURITY_POLICY_REFUSAL

    # Benign academic/RAG queries must NOT be blocked
    safe_queries = [
        "What is machine learning?",
        "Summarize the main themes of section 2",
        "How do transformers compute attention weights?",
        "What are the network virtualization standards?",
    ]
    for query in safe_queries:
        is_blocked, _ = is_pii_extraction_query(query)
        assert is_blocked is False, f"Safe query '{query}' was falsely blocked!"


def test_chunking_masks_pii_in_storage():
    item = ParsedItem(
        content_type="TEXT",
        text="Aadhaar: 2345 6789 0123. PAN: ABCDE1234F. Bank A/C: 987654321012.",
        page_number=1,
        source_reference="passbook.pdf#page=1",
        image_reference=None,
        section="Personal Details",
        metadata={"filename": "passbook.pdf"},
    )
    chunks = chunk_item(item)
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.metadata.get("has_pii") is True
    assert chunk.metadata.get("is_sensitive_id_document") is True
    assert "aadhaar" in chunk.metadata.get("pii_types", [])
    assert "2345 6789 0123" not in chunk.text
    assert "ABCDE1234F" not in chunk.text
    assert "987654321012" not in chunk.text
    assert "[REDACTED_AADHAAR]" in chunk.text


def test_ordinary_document_text_passes_without_false_positives():
    ordinary_passages = [
        "The cat is orange and sleeps on the couch.",
        "Mean squared error is a measure of the average squared difference between estimated values and actual values.",
        "VLAN is a virtual network created by configuring switches, part of the Ethernet standard.",
        "Revenue increased by 15% from 100 million to 115 million dollars in Q3.",
    ]
    for passage in ordinary_passages:
        assert contains_high_risk_pii(passage) is False
        assert contains_secret_pattern(passage) is False


def test_sensitive_identity_passage_detection():
    from core.schemas import EvidenceRecord
    from core.guardrails.pii import is_sensitive_identity_or_secret_passage

    aadhaar_evidence = EvidenceRecord(
        evidence_id="ev-aadhaar-1",
        collection_id="col-1",
        document_id="doc-aadhaar",
        filename="DOC-20260705-WA0003..pdf",
        page_number=1,
        content_type="TEXT",
        source_reference="WA0003.pdf#page=1",
        score=None,
        text=(
            "Enrolment No.: 0143/28812/00906 To Ayush Kumar Jena S/O Amaresh Jena, "
            "BALABHADRAPUR, VTC: Nuapara, PO: Nuapada, Dist: Khorda, Odisha - 752102. "
            "DOB: 25/06/2005. MALE. Aadhaar no. issued: 11/03/2013"
        ),
        image_reference=None,
        section=None,
        metadata={"has_pii": True, "pii_types": ["aadhaar", "phone"], "is_sensitive_id_document": True},
    )
    assert is_sensitive_identity_or_secret_passage(aadhaar_evidence) is True

    ordinary_evidence = EvidenceRecord(
        evidence_id="ev-ordinary-1",
        collection_id="col-1",
        document_id="doc-normal",
        filename="cloud_computing.pdf",
        page_number=1,
        content_type="TEXT",
        source_reference="cloud.pdf#page=1",
        score=None,
        text="Cloud computing provides on-demand availability of computer system resources.",
        image_reference=None,
        section=None,
        metadata={},
    )
    assert is_sensitive_identity_or_secret_passage(ordinary_evidence) is False


def test_aadhaar_queries_are_blocked():
    aadhaar_queries = [
        "What is in my aadhar?",
        "Tell me my aadhar details",
        "Who is the cardholder?",
        "What is the date of birth in the document?",
        "What is the address in the document?",
        "What is the enrolment number?",
        "What are my personal details?",
    ]
    for q in aadhaar_queries:
        is_blocked, msg = is_pii_extraction_query(q)
        assert is_blocked is True, f"Aadhaar query '{q}' was not blocked!"
        assert msg == SECURITY_POLICY_REFUSAL


def test_answer_service_refuses_aadhaar_document():
    from core.retrieval.answering import GroundedAnswerService
    from core.schemas import EvidenceRecord
    from core.retrieval.query import RetrievedEvidence

    aadhaar_rec = EvidenceRecord(
        evidence_id="ev-aadhaar-1",
        collection_id="col-test",
        document_id="doc-aadhaar",
        filename="DOC-20260705-WA0003..pdf",
        page_number=1,
        content_type="TEXT",
        source_reference="WA0003.pdf#page=1",
        score=None,
        text=(
            "Enrolment No.: [REDACTED_ENROLMENT_NO] To Ayush Kumar Jena S/O [REDACTED_NAME], "
            "BALABHADRAPUR, VTC: Nuapara, PO: Nuapada, Dist: Khorda, Odisha - 752102. "
            "DOB: [REDACTED_DOB]. MALE. Aadhaar no. issued: 11/03/2013 [REDACTED_AADHAAR]"
        ),
        image_reference=None,
        section=None,
        metadata={"has_pii": True, "pii_types": ["aadhaar", "phone"], "is_sensitive_id_document": True},
    )

    class MockRetriever:
        def retrieve(self, collection_id, question, selected_document_ids, top_k):
            return [RetrievedEvidence(aadhaar_rec, retrieval_score=0.95)]

    class MockReasoningClient:
        def answer(self, question, context):
            # This should NEVER be called!
            raise RuntimeError("Reasoning client should not be invoked on sensitive identity documents!")

    answer_service = GroundedAnswerService(retriever=MockRetriever(), reasoning_client=MockReasoningClient())
    
    # Generic question that bypasses regex query intent
    result = answer_service.answer(
        collection_id="col-test",
        question="What is the general topic discussed in this document?",
        selected_document_ids=["doc-aadhaar"],
        top_k=5,
    )

    assert result.answer == SECURITY_POLICY_REFUSAL
    assert result.response_mode == "abstention"
    assert len(result.retrieved_evidence) == 0


def test_bank_statement_query_intent_screening():
    statement_queries = [
        "What is my bank account balance?",
        "How much was debited in my statement?",
        "What is the closing balance on 30/09/2026?",
        "Show me my UPI transactions",
        "How much did I transfer to BHAGIRAT?",
        "Give me my account statement summary",
        "What was the total credits amount?",
        "Who sent money to my bank account?",
    ]
    for q in statement_queries:
        is_blocked, msg = is_pii_extraction_query(q)
        assert is_blocked is True, f"Bank statement query '{q}' was not blocked!"
        assert msg == SECURITY_POLICY_REFUSAL


def test_answer_service_refuses_bank_account_statement():
    from core.retrieval.answering import GroundedAnswerService
    from core.schemas import EvidenceRecord
    from core.retrieval.query import RetrievedEvidence

    statement_chunk = EvidenceRecord(
        evidence_id="ev-stmt-1",
        collection_id="col-test",
        document_id="doc-bank-stmt",
        filename="AccountStatement_11102026_163420_unlocked.pdf",
        page_number=1,
        content_type="TEXT",
        source_reference="AccountStatement.pdf#chunk=1",
        score=None,
        text=(
            "WDL TFR UPI/DR/237232205204/BHAGIRAT /YESB/paytmqr6kz/Paym 0097693162093 "
            "AT 13596 BALIPATNA - 250.00 - 993.26\n"
            "04/09/2026 04/09/2026 DEP TFR UPI/CR/624581082245/RASHMITA Clear Balance: 993.26"
        ),
        image_reference=None,
        section=None,
        metadata={"format": "pdf", "is_sensitive_document": True},
    )

    class MockRetriever:
        def retrieve(self, collection_id, question, selected_document_ids, top_k):
            return [RetrievedEvidence(statement_chunk, retrieval_score=0.92)]

    class MockReasoningClient:
        def answer(self, question, context):
            raise RuntimeError("Reasoning client should never be invoked on bank statements!")

    answer_service = GroundedAnswerService(retriever=MockRetriever(), reasoning_client=MockReasoningClient())

    result = answer_service.answer(
        collection_id="col-test",
        question="Give me the numbers mentioned in this text.",
        selected_document_ids=["doc-bank-stmt"],
        top_k=5,
    )

    assert result.answer == SECURITY_POLICY_REFUSAL
    assert result.response_mode == "abstention"
    assert len(result.retrieved_evidence) == 0


def test_technical_documents_and_handbooks_not_blocked():
    """Verify that technical documents, matrices, code tokens, and ordinary books never trigger security block."""
    from core.schemas import EvidenceRecord
    from core.guardrails.pii import is_sensitive_identity_or_secret_passage, is_sensitive_filename
    from core.retrieval.answering import GroundedAnswerService
    from core.retrieval.query import RetrievedEvidence

    # 1. Filename checks
    assert is_sensitive_filename("LLM Engineer's Handbook.pdf") is False
    assert is_sensitive_filename("book.pdf") is False
    assert is_sensitive_filename("company_expansion.pdf") is False
    assert is_sensitive_filename("world_bank_report.pdf") is False
    assert is_sensitive_filename("financial_analysis.pdf") is False
    assert is_sensitive_filename("japan_history.pdf") is False
    assert is_sensitive_filename("pan.jpeg") is True
    assert is_sensitive_filename("aadhaar_card.pdf") is True
    assert is_sensitive_filename("AccountStatement_11102026_163420_unlocked.pdf") is True
    assert is_sensitive_filename("passbook.pdf") is True

    # 2. Evidence chunks from technical handbook with numeric tables and variables
    handbook_chunk = EvidenceRecord(
        evidence_id="ev-handbook-1",
        collection_id="col-test",
        document_id="doc-handbook",
        filename="LLM Engineer's Handbook.pdf",
        page_number=42,
        content_type="TEXT",
        source_reference="LLM_Handbook.pdf#chunk=1",
        score=None,
        text=(
            "Transformers utilize self-attention mechanisms to process sequential data. "
            "Batch sizes can be 2001 8000 2000 in large tensor operations. "
            "Variables such as model0001a and epoch0001b control the training loop. "
            "Contact publisher at support@packtpub.com for details."
        ),
        image_reference=None,
        section="Chapter 3",
        metadata={"filename": "LLM Engineer's Handbook.pdf"},
    )
    assert is_sensitive_identity_or_secret_passage(handbook_chunk) is False

    # 3. Grounded answer service successfully answers questions from this document
    class MockRetriever:
        def retrieve(self, collection_id, question, selected_document_ids, top_k):
            return [RetrievedEvidence(handbook_chunk, retrieval_score=0.95)]

    class MockReasoningClient:
        def answer(self, question, context):
            return "Transformers utilize self-attention mechanisms to process sequential data. [evidence:ev-handbook-1]"

    service = GroundedAnswerService(retriever=MockRetriever(), reasoning_client=MockReasoningClient())
    res = service.answer(
        collection_id="col-test",
        question="What are Transformers?",
        selected_document_ids=["doc-handbook"],
        top_k=5,
    )
    assert res.answerability.value == "SUPPORTED"
    assert "Transformers utilize self-attention mechanisms" in res.answer
    assert res.response_mode == "llm_structured"





