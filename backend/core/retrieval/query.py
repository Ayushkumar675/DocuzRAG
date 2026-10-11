"""Scope-filtered vector retrieval for single and multi-document queries."""

from __future__ import annotations

from dataclasses import dataclass

from core.guardrails.scope import validate_document_scope
from core.llm.nvidia_embeddings import NvidiaEmbeddingClient
from core.schemas import EvidenceRecord
from core.storage.metadata_store import MetadataStore
from core.storage.qdrant_store import QdrantStore


@dataclass(frozen=True, slots=True)
class RetrievedEvidence:
    evidence: EvidenceRecord
    retrieval_score: float
    vector_score: float | None = None
    keyword_score: float | None = None
    fusion_score: float | None = None
    rerank_score: float | None = None


class ScopedRetriever:
    """Retrieve only evidence permitted by collection and document scope."""

    def __init__(
        self,
        metadata_store: MetadataStore,
        embedding_client: NvidiaEmbeddingClient,
        qdrant_store: QdrantStore,
    ) -> None:
        self.metadata_store = metadata_store
        self.embedding_client = embedding_client
        self.qdrant_store = qdrant_store

    def retrieve(
        self,
        collection_id: str,
        question: str,
        selected_document_ids: list[str] | None,
        top_k: int,
    ) -> list[RetrievedEvidence]:
        scope = validate_document_scope(
            self.metadata_store,
            collection_id,
            selected_document_ids,
        )
        if not question.strip():
            raise ValueError("Question cannot be empty.")
        if top_k <= 0:
            raise ValueError("top_k must be positive.")

        query_vector = self.embedding_client.embed_texts([question], input_type="query")[0]
        hits = self.qdrant_store.search(
            query_vector=query_vector,
            collection_id=collection_id,
            selected_document_ids=scope,
            limit=top_k,
        )

        retrieved: list[RetrievedEvidence] = []
        for hit in hits:
            evidence_id = hit.payload.get("evidence_id")
            if not isinstance(evidence_id, str):
                continue
            evidence = self.metadata_store.get_evidence(evidence_id, collection_id)
            if evidence is None:
                continue
            if scope is not None and evidence.document_id not in scope:
                continue
            retrieved.append(
                RetrievedEvidence(
                    evidence=evidence,
                    retrieval_score=hit.score,
                    vector_score=hit.score,
                    fusion_score=hit.score,
                )
            )
        return retrieved
