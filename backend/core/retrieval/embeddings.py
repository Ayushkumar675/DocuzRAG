"""Evidence embedding and Qdrant indexing orchestration."""

from __future__ import annotations

from dataclasses import dataclass

from core.llm.nvidia_embeddings import NvidiaEmbeddingClient
from core.schemas import EvidenceRecord
from core.storage.metadata_store import MetadataStore
from core.storage.qdrant_store import QdrantStore
from core.observability import log_event, log_span


class IndexingDocumentNotFoundError(LookupError):
    """Raised when an index request targets an unknown scoped document."""


@dataclass(frozen=True, slots=True)
class IndexResult:
    collection_id: str
    indexed_count: int
    skipped_count: int
    vector_size: int | None


class EvidenceIndexer:
    """Embed textual evidence and retain all source metadata in Qdrant."""

    def __init__(
        self,
        metadata_store: MetadataStore,
        embedding_client: NvidiaEmbeddingClient,
        qdrant_store: QdrantStore,
        batch_size: int = 32,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("Embedding batch size must be positive.")
        self.metadata_store = metadata_store
        self.embedding_client = embedding_client
        self.qdrant_store = qdrant_store
        self.batch_size = batch_size

    def index_collection(self, collection_id: str, only_unindexed: bool = False) -> IndexResult:
        if self.metadata_store.get_collection(collection_id) is None:
            raise IndexingDocumentNotFoundError(
                f"Collection '{collection_id}' was not found."
            )
        if only_unindexed:
            indexed_ids = set(self.metadata_store.ingestion_status(collection_id)["indexed_document_ids"])
            docs = self.metadata_store.list_documents(collection_id)
            unindexed_doc_ids = {d.id for d in docs if d.id not in indexed_ids and d.status == "processed"}
            if not unindexed_doc_ids:
                total_ev = len(self.metadata_store.list_evidence(collection_id))
                return IndexResult(collection_id, total_ev, 0, None)
            evidence = [
                item for doc_id in unindexed_doc_ids
                for item in self.metadata_store.list_evidence(collection_id, doc_id)
            ]
            return self._index(collection_id, evidence)
        evidence = self.metadata_store.list_evidence(collection_id)
        return self._index(collection_id, evidence)

    def index_document(self, collection_id: str, document_id: str) -> IndexResult:
        if self.metadata_store.get_document(document_id, collection_id) is None:
            raise IndexingDocumentNotFoundError(
                f"Document '{document_id}' was not found in collection '{collection_id}'."
            )
        evidence = self.metadata_store.list_evidence(collection_id, document_id)
        return self._index(collection_id, evidence)

    def _index(
        self,
        collection_id: str,
        evidence: list[EvidenceRecord],
    ) -> IndexResult:
        log_event("indexing.started", service="evidence_indexer", status="indexing",
                  collection_id=collection_id)
        textual = [item for item in evidence if item.text and item.text.strip()]
        document_ids = list({item.document_id for item in evidence})
        self.metadata_store.invalidate_indexes(document_ids)
        skipped_count = len(evidence) - len(textual)
        indexed_count = 0
        vector_size: int | None = None

        if textual:
            self.qdrant_store.healthcheck()

        for batch in _batches(textual, self.batch_size):
            with log_span("indexing.embedding_batch", batch_count=len(batch)):
                vectors = self.embedding_client.embed_texts(
                    [item.text for item in batch if item.text is not None]
                )
            if vector_size is None:
                vector_size = len(vectors[0])
                self.qdrant_store.ensure_collection(vector_size)
                for document_id in {item.document_id for item in evidence}:
                    self.qdrant_store.delete_document_vectors(collection_id, document_id)
            self.qdrant_store.upsert_evidence(batch, vectors)
            indexed_count += len(batch)

        self.metadata_store.mark_documents_indexed(collection_id, document_ids)
        log_event("indexing.completed", service="evidence_indexer", status="ready",
                  indexed_count=indexed_count, skipped_count=skipped_count)
        return IndexResult(
            collection_id=collection_id,
            indexed_count=indexed_count,
            skipped_count=skipped_count,
            vector_size=vector_size,
        )


def _batches(items: list[EvidenceRecord], size: int) -> list[list[EvidenceRecord]]:
    return [items[start : start + size] for start in range(0, len(items), size)]
