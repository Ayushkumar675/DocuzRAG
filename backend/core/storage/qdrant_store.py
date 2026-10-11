"""Qdrant vector storage with complete evidence payloads."""

from __future__ import annotations

from typing import Any
from dataclasses import dataclass

from qdrant_client import QdrantClient, models

from core.schemas import EvidenceRecord


class QdrantStoreError(RuntimeError):
    """Raised when Qdrant cannot create or write the configured collection."""


@dataclass(frozen=True, slots=True)
class QdrantSearchHit:
    score: float
    payload: dict[str, Any]


class QdrantStore:
    """Store vectors while retaining source identity in every payload."""

    def __init__(
        self,
        url: str,
        collection_name: str,
        client: QdrantClient | None = None,
        api_key: str | None = None,
    ) -> None:
        self.url = url
        self.collection_name = collection_name
        self._client = client
        self._api_key = api_key

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(
                url=self.url, api_key=self._api_key, timeout=20, check_compatibility=False
            )
        return self._client

    def delete_document_vectors(self, collection_id: str, document_id: str) -> None:
        """Remove obsolete chunks inside one explicit collection/document scope."""
        try:
            if self.client.collection_exists(self.collection_name):
                self.client.delete(
                    self.collection_name,
                    points_selector=models.FilterSelector(filter=models.Filter(must=[
                        models.FieldCondition(key="collection_id", match=models.MatchValue(value=collection_id)),
                        models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
                    ])),
                    wait=True,
                )
        except Exception as error:
            raise QdrantStoreError("Qdrant scoped cleanup failed.") from error

    def delete_collection_vectors(self, collection_id: str) -> None:
        """Remove all vectors inside one explicit collection scope."""
        try:
            if self.client.collection_exists(self.collection_name):
                self.client.delete(
                    self.collection_name,
                    points_selector=models.FilterSelector(filter=models.Filter(must=[
                        models.FieldCondition(key="collection_id", match=models.MatchValue(value=collection_id)),
                    ])),
                    wait=True,
                )
        except Exception as error:
            raise QdrantStoreError("Qdrant collection cleanup failed.") from error

    def healthcheck(self) -> None:
        """Confirm Qdrant is reachable before expensive embedding work."""

        try:
            self.client.get_collections()
        except Exception as error:
            raise QdrantStoreError(
                "Qdrant is unavailable. Start Qdrant or verify QDRANT_URL."
            ) from error

    def ensure_collection(self, vector_size: int) -> None:
        if vector_size <= 0:
            raise QdrantStoreError("Vector size must be positive.")
        try:
            if not self.client.collection_exists(self.collection_name):
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=vector_size,
                        distance=models.Distance.COSINE,
                    ),
                )
                return

            existing_size = self._vector_size()
            if existing_size != vector_size:
                raise QdrantStoreError(
                    "Configured Qdrant collection has a different vector dimension."
                )
        except QdrantStoreError:
            raise
        except Exception as error:
            raise QdrantStoreError(
                "Qdrant collection setup failed. Check QDRANT_URL and vector dimensions."
            ) from error

    def upsert_evidence(
        self,
        evidence_items: list[EvidenceRecord],
        vectors: list[list[float]],
    ) -> None:
        if len(evidence_items) != len(vectors):
            raise QdrantStoreError("Evidence and vector counts do not match.")
        if not evidence_items:
            return

        points = [
            models.PointStruct(
                id=evidence.evidence_id,
                vector=vector,
                payload=self._payload(evidence),
            )
            for evidence, vector in zip(evidence_items, vectors, strict=True)
        ]
        try:
            self.client.upsert(
                collection_name=self.collection_name,
                points=points,
                wait=True,
            )
        except Exception as error:
            raise QdrantStoreError("Qdrant vector upsert failed.") from error

    def search(
        self,
        query_vector: list[float],
        collection_id: str,
        selected_document_ids: tuple[str, ...] | None,
        limit: int,
    ) -> list[QdrantSearchHit]:
        """Search with mandatory collection scope and optional document scope."""

        if not query_vector:
            raise QdrantStoreError("Query vector cannot be empty.")
        if limit <= 0:
            raise QdrantStoreError("Search limit must be positive.")

        conditions = [
            models.FieldCondition(
                key="collection_id",
                match=models.MatchValue(value=collection_id),
            )
        ]
        if selected_document_ids is not None:
            conditions.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchAny(any=list(selected_document_ids)),
                )
            )
        query_filter = models.Filter(must=conditions)

        try:
            if hasattr(self.client, "query_points"):
                result = self.client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                )
                points = result.points
            else:
                points = self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                )
        except Exception as error:
            raise QdrantStoreError("Qdrant vector search failed.") from error

        hits: list[QdrantSearchHit] = []
        for point in points:
            payload = point.payload or {}
            if not isinstance(payload, dict):
                continue
            hits.append(QdrantSearchHit(score=float(point.score), payload=payload))
        return hits

    def _vector_size(self) -> int:
        collection = self.client.get_collection(self.collection_name)
        vectors = collection.config.params.vectors
        if isinstance(vectors, models.VectorParams):
            return vectors.size
        if isinstance(vectors, dict) and vectors:
            first = next(iter(vectors.values()))
            return first.size
        raise QdrantStoreError("Qdrant collection has no readable vector configuration.")

    @staticmethod
    def _payload(evidence: EvidenceRecord) -> dict[str, Any]:
        return {
            "evidence_id": evidence.evidence_id,
            "collection_id": evidence.collection_id,
            "document_id": evidence.document_id,
            "filename": evidence.filename,
            "page_number": evidence.page_number,
            "content_type": evidence.content_type,
            "source_reference": evidence.source_reference,
            "score": evidence.score,
            "text": evidence.text,
            "image_reference": evidence.image_reference,
            "section": evidence.section,
            "metadata": evidence.metadata,
        }
