"""Collection and upload orchestration for Phase 1."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from core.ingestion.validation import validate_upload
from core.schemas import CollectionRecord, DocumentRecord
from core.storage.document_store import DocumentStore
from core.storage.metadata_store import MetadataStore
from core.storage.qdrant_store import QdrantStore
from core.observability import observed_service


class CollectionNotFoundError(LookupError):
    """Raised when an operation targets an unknown collection."""


class DocumentNotFoundError(LookupError):
    """Raised when an operation targets a document outside its collection."""


class CollectionService:
    """Coordinate metadata and original-file persistence."""

    def __init__(
        self,
        metadata_store: MetadataStore,
        document_store: DocumentStore,
        max_upload_size_bytes: int,
        qdrant_store: QdrantStore | None = None,
    ) -> None:
        self.metadata_store = metadata_store
        self.document_store = document_store
        self.max_upload_size_bytes = max_upload_size_bytes
        self.qdrant_store = qdrant_store

    @observed_service("collections.create")
    def create_collection(self, name: str) -> CollectionRecord:
        normalized_name = " ".join(name.split())
        if not normalized_name:
            raise ValueError("Collection name cannot be empty.")
        return self.metadata_store.create_collection(normalized_name)

    @observed_service("collections.list")
    def list_collections(self) -> list[CollectionRecord]:
        return self.metadata_store.list_collections()

    def get_collection(self, collection_id: str) -> CollectionRecord:
        collection = self.metadata_store.get_collection(collection_id)
        if collection is None:
            raise CollectionNotFoundError(f"Collection '{collection_id}' was not found.")
        return collection

    @observed_service("collections.delete")
    def delete_collection(self, collection_id: str) -> CollectionRecord:
        """Delete an entire collection and every dependent representation."""
        collection = self.get_collection(collection_id)
        if self.qdrant_store is not None:
            self.qdrant_store.delete_collection_vectors(collection_id)
        self.document_store.remove_collection(collection_id)
        self.metadata_store.delete_collection(collection_id)
        return collection

    @observed_service("documents.list")
    def list_documents(self, collection_id: str) -> list[DocumentRecord]:
        self.get_collection(collection_id)
        return self.metadata_store.list_documents(collection_id)

    @observed_service("documents.upload")
    def upload_documents(
        self,
        collection_id: str,
        uploads: list[tuple[str, bytes]],
    ) -> list[DocumentRecord]:
        self.get_collection(collection_id)
        if not uploads:
            raise ValueError("At least one document is required.")

        validated = [
            validate_upload(filename, content, self.max_upload_size_bytes)
            for filename, content in uploads
        ]
        stored_documents: list[DocumentRecord] = []
        stored_paths: list[str] = []

        try:
            for file in validated:
                document_id = str(uuid4())
                storage_path = self.document_store.save(
                    collection_id=collection_id,
                    document_id=document_id,
                    filename=file.filename,
                    content=file.content,
                )
                stored_paths.append(storage_path)
                document = DocumentRecord(
                    id=document_id,
                    collection_id=collection_id,
                    filename=file.filename,
                    file_type=file.file_type,
                    size=file.size,
                    page_count=None,
                    status="uploaded",
                    created_at=datetime.now(timezone.utc),
                    storage_path=storage_path,
                )
                self.metadata_store.add_document(document)
                stored_documents.append(document)
        except Exception:
            for document in stored_documents:
                self.metadata_store.delete_document(document.id)
            for storage_path in stored_paths:
                self.document_store.remove(storage_path)
            raise

        return stored_documents

    @observed_service("documents.delete")
    def delete_document(self, collection_id: str, document_id: str) -> DocumentRecord:
        """Delete one document and every representation owned by it."""

        self.get_collection(collection_id)
        if self.metadata_store.ingestion_status(collection_id)["busy"]:
            raise ValueError("Wait for document processing and indexing to finish before deleting.")

        document = self.metadata_store.get_document(document_id, collection_id)
        if document is None:
            raise DocumentNotFoundError(
                f"Document '{document_id}' was not found in collection '{collection_id}'."
            )
        if self.qdrant_store is None:
            raise RuntimeError("Document deletion requires the configured Qdrant store.")

        # Leave local metadata and the original retryable if Qdrant is down.
        self.qdrant_store.delete_document_vectors(collection_id, document.id)
        self.document_store.remove(document.storage_path)
        if not self.metadata_store.delete_document(document.id, collection_id):
            raise DocumentNotFoundError(
                f"Document '{document_id}' disappeared from collection '{collection_id}'."
            )
        return document
