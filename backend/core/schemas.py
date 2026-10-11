"""Shared records and API schemas for the DocuNova phases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, SecretStr


@dataclass(frozen=True, slots=True)
class CollectionRecord:
    id: str
    name: str
    created_at: datetime
    document_count: int


@dataclass(frozen=True, slots=True)
class DocumentRecord:
    id: str
    collection_id: str
    filename: str
    file_type: str
    size: int
    page_count: int | None
    status: str
    created_at: datetime
    storage_path: str


@dataclass(frozen=True, slots=True)
class EvidenceRecord:
    evidence_id: str
    collection_id: str
    document_id: str
    filename: str
    page_number: int | None
    content_type: str
    source_reference: str
    score: float | None
    text: str | None
    image_reference: str | None
    section: str | None
    metadata: dict[str, Any]


class CollectionCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CollectionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    document_count: int


class DocumentResponse(BaseModel):
    id: str
    collection_id: str
    filename: str
    file_type: str
    size: int
    page_count: int | None
    status: str
    created_at: datetime


class EvidenceResponse(BaseModel):
    evidence_id: str
    collection_id: str
    document_id: str
    filename: str
    page_number: int | None
    content_type: str
    source_reference: str
    score: float | None
    text: str | None
    image_reference: str | None
    section: str | None
    metadata: dict[str, Any]


class ProcessResponse(BaseModel):
    document: DocumentResponse
    evidence_count: int
    content_types: list[str]


class IndexResponse(BaseModel):
    collection_id: str
    indexed_count: int
    skipped_count: int
    vector_size: int | None


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=10000)
    selected_document_ids: list[str] | None = None
    top_k: int = Field(default=15, ge=1, le=40)


class RetrievedEvidenceResponse(BaseModel):
    evidence_id: str
    collection_id: str
    document_id: str
    filename: str
    page_number: int | None
    content_type: str
    source_reference: str
    retrieval_score: float
    vector_score: float | None = None
    keyword_score: float | None = None
    fusion_score: float | None = None
    rerank_score: float | None = None
    text: str | None
    image_reference: str | None
    section: str | None
    metadata: dict[str, Any]


class QueryResponse(BaseModel):
    answer: str
    answerability: Literal[
        "SUPPORTED",
        "PARTIALLY_SUPPORTED",
        "NOT_SUPPORTED",
    ]
    verified: bool
    citations: list[str]
    evidence: list[RetrievedEvidenceResponse]
    claims: list[dict[str, Any]] = Field(default_factory=list)
    contradictions: list[dict[str, Any]] = Field(default_factory=list)
    verification_issues: list[str] = Field(default_factory=list)
    guardrails_invoked: list[str] = Field(default_factory=list)
    services_invoked: list[str] = Field(default_factory=list)
    response_mode: str = "llm_structured"


class CalculationRequestSchema(BaseModel):
    operation: str
    values: list[int | float | str] = Field(min_length=1)


class CalculationResponse(BaseModel):
    operation: str
    inputs: list[str]
    result: str
    explanation: str


class ComparisonRequest(BaseModel):
    before_document_id: str
    after_document_id: str


class ComparisonDifferenceResponse(BaseModel):
    key: str
    change_type: str
    before_text: str | None
    after_text: str | None
    before_evidence_ids: list[str]
    after_evidence_ids: list[str]


class ComparisonResponse(BaseModel):
    collection_id: str
    before_document_id: str
    after_document_id: str
    differences: list[ComparisonDifferenceResponse]


class EvaluationRequest(BaseModel):
    collection_id: str | None = None
    retrieved_ids: list[str] = Field(default_factory=list)
    relevant_ids: list[str] = Field(default_factory=list)
    ranked_runs: list[list[str]] = Field(default_factory=list)
    claims: list[dict[str, Any]] = Field(default_factory=list)
    contradiction_statuses: list[str] = Field(default_factory=list)
    predicted_answerability: list[str] = Field(default_factory=list)
    expected_answerability: list[str] = Field(default_factory=list)
    latencies_ms: list[float] = Field(default_factory=list)
    tool_successes: list[bool] = Field(default_factory=list)
    k: int = Field(default=5, ge=1, le=100)


class EvaluationResponse(BaseModel):
    metrics: dict[str, float]
    sample_count: int


class UploadResponse(BaseModel):
    collection_id: str
    documents: list[DocumentResponse]
    job_id: str | None = None


class ProviderSettingsRequest(BaseModel):
    nvidia_api_key: SecretStr | None = None
    nvidia_reranker_api_key: SecretStr | None = None
