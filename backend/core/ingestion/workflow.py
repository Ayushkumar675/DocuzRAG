"""Durable collection-level automatic processing and indexing workflow."""

import time
from core.observability import log_event, log_span


class IngestionWorkflow:
    def __init__(self, metadata_store, ingestion_service, indexer) -> None:
        self.metadata = metadata_store
        self.processor = ingestion_service
        self.indexer = indexer

    def run(self, collection_id: str, job_id: str) -> None:
        """Executed in a FastAPI background worker; progress lives in SQLite."""
        start_time = time.perf_counter()
        try:
            with log_span("ingestion.workflow", collection_id=collection_id, job_id=job_id):
                self.metadata.update_ingestion_job(job_id, "processing", "Processing uploaded documents")
                log_event("ingestion.status", service="ingestion_workflow", status="processing")
                proc_start = time.perf_counter()
                for document in self.metadata.list_documents(collection_id):
                    evidence = self.metadata.list_evidence(collection_id, document.id)
                    needs_visual_retry = (
                        document.file_type in {"png", "jpg", "jpeg"}
                        and self.processor.vision_agent is not None
                        and not any(item.content_type == "VISION" for item in evidence)
                    )
                    if document.status != "processed" or needs_visual_retry:
                        self.processor.process_document(collection_id, document.id)
                proc_duration = time.perf_counter() - proc_start

                self.metadata.update_ingestion_job(
                    job_id, "indexing", f"Indexing evidence in Qdrant (Processing took {proc_duration:.1f}s)"
                )
                log_event("ingestion.status", service="ingestion_workflow", status="indexing")
                index_start = time.perf_counter()
                result = self.indexer.index_collection(collection_id, only_unindexed=True)
                total_evidence_count = len(self.metadata.list_evidence(collection_id))
                if total_evidence_count == 0:
                    raise ValueError("No searchable text was extracted. Configure OCR for image/scanned documents.")
                index_duration = time.perf_counter() - index_start
                total_duration = time.perf_counter() - start_time

                detail_msg = (
                    f"Indexed {result.indexed_count} evidence item(s) in {total_duration:.1f}s "
                    f"(Processing: {proc_duration:.1f}s, Indexing: {index_duration:.1f}s)."
                )
                self.metadata.update_ingestion_job(job_id, "ready", detail_msg)
                log_event(
                    "ingestion.status",
                    service="ingestion_workflow",
                    status="ready",
                    indexed_count=result.indexed_count,
                    processing_seconds=round(proc_duration, 2),
                    indexing_seconds=round(index_duration, 2),
                    total_seconds=round(total_duration, 2),
                )
        except Exception as error:
            # Expose only the application's safe provider/configuration messages.
            from core.config import ConfigurationError
            from core.llm.nvidia_embeddings import EmbeddingServiceError
            from core.storage.qdrant_store import QdrantStoreError
            detail = str(error) if isinstance(error, (ConfigurationError, EmbeddingServiceError,
                                                       QdrantStoreError, ValueError)) else "Document preparation failed."
            self.metadata.update_ingestion_job(job_id, "error", detail)
            log_event("ingestion.status", service="ingestion_workflow", status="error",
                      error_type=type(error).__name__)
