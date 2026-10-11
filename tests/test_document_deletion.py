from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from core.collections.service import (
    CollectionService,
    DocumentNotFoundError,
)
from core.schemas import DocumentRecord, EvidenceRecord
from core.storage.document_store import DocumentStore
from core.storage.metadata_store import MetadataStore
from core.storage.qdrant_store import QdrantStore


class RecordingQdrant:
    def __init__(self):
        self.calls = []

    def delete_document_vectors(self, collection_id, document_id):
        self.calls.append((collection_id, document_id))


def _document(store, collection, filename):
    document_id = str(uuid4())
    path = store.document_store.save(collection.id, document_id, filename, b"source")
    document = DocumentRecord(
        id=document_id,
        collection_id=collection.id,
        filename=filename,
        file_type="txt",
        size=6,
        page_count=None,
        status="processed",
        created_at=collection.created_at,
        storage_path=path,
    )
    store.metadata_store.add_document(document)
    evidence = EvidenceRecord(
        evidence_id=str(uuid4()),
        collection_id=collection.id,
        document_id=document.id,
        filename=filename,
        page_number=1,
        content_type="TEXT",
        source_reference=f"document:{filename}#page=1",
        score=None,
        text="source evidence",
        image_reference=None,
        section=None,
        metadata={},
    )
    store.metadata_store.add_evidence(evidence)
    return document, evidence


class _Stores:
    def __init__(self, tmp_path):
        self.metadata_store = MetadataStore(tmp_path / "metadata.db")
        self.document_store = DocumentStore(tmp_path / "documents")


def test_delete_document_cleans_scoped_metadata_file_vectors_and_dependent_artifacts(tmp_path):
    stores = _Stores(tmp_path)
    first_collection = stores.metadata_store.create_collection("first")
    second_collection = stores.metadata_store.create_collection("second")
    document, evidence = _document(stores, first_collection, "remove.txt")
    retained, retained_evidence = _document(stores, first_collection, "retain.txt")
    other_collection_document, _ = _document(stores, second_collection, "other.txt")
    stores.metadata_store.mark_documents_indexed(first_collection.id, [document.id, retained.id])

    dependent = stores.metadata_store.save_learning_artifact(
        first_collection.id, "cheat-sheet", {"source_evidence_ids": [evidence.evidence_id]}, [document.id]
    )
    retained_artifact = stores.metadata_store.save_learning_artifact(
        first_collection.id, "cheat-sheet", {"source_evidence_ids": [retained_evidence.evidence_id]}, [retained.id]
    )
    qdrant = RecordingQdrant()
    service = CollectionService(stores.metadata_store, stores.document_store, 1000, qdrant)

    service.delete_document(first_collection.id, document.id)

    assert qdrant.calls == [(first_collection.id, document.id)]
    assert not stores.document_store.path_for(document.storage_path).exists()
    assert stores.metadata_store.get_document(document.id, first_collection.id) is None
    assert stores.metadata_store.list_evidence(first_collection.id, document.id) == []
    with stores.metadata_store._connect() as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM document_indexes WHERE document_id = ?",
            (document.id,),
        ).fetchone()[0] == 0
    assert stores.metadata_store.get_learning_artifact(dependent["id"]) is None
    assert stores.metadata_store.get_learning_artifact(retained_artifact["id"]) is not None
    assert stores.metadata_store.get_document(retained.id, first_collection.id) is not None
    assert stores.metadata_store.get_document(other_collection_document.id, second_collection.id) is not None
    assert stores.document_store.path_for(stores.metadata_store.get_document(retained.id).storage_path).exists()


def test_delete_document_rejects_wrong_collection_without_cleanup(tmp_path):
    stores = _Stores(tmp_path)
    owner = stores.metadata_store.create_collection("owner")
    other = stores.metadata_store.create_collection("other")
    document, _ = _document(stores, owner, "source.txt")
    qdrant = RecordingQdrant()
    service = CollectionService(stores.metadata_store, stores.document_store, 1000, qdrant)

    with pytest.raises(DocumentNotFoundError):
        service.delete_document(other.id, document.id)

    assert qdrant.calls == []
    assert stores.metadata_store.get_document(document.id, owner.id) is not None
    assert stores.document_store.path_for(document.storage_path).exists()


def test_qdrant_delete_filter_contains_both_project_scope_boundaries():
    class Client:
        def __init__(self):
            self.deleted = None

        def collection_exists(self, name):
            return name == "docuzrag"

        def delete(self, collection_name, points_selector, wait):
            self.deleted = (collection_name, points_selector, wait)

    client = Client()
    store = QdrantStore("http://qdrant", "docuzrag", client=client)
    store.delete_document_vectors("collection-a", "document-a")

    collection_name, selector, wait = client.deleted
    assert collection_name == "docuzrag"
    assert wait is True
    assert {
        (condition.key, condition.match.value)
        for condition in selector.filter.must
    } == {
        ("collection_id", "collection-a"),
        ("document_id", "document-a"),
    }


def test_delete_route_maps_scoped_missing_document_to_404(monkeypatch):
    from api import fastapi_app

    class MissingService:
        def delete_document(self, collection_id, document_id):
            raise DocumentNotFoundError("document is not in this collection")

    monkeypatch.setattr(
        fastapi_app.collection_service,
        "delete_document",
        MissingService().delete_document,
    )

    with TestClient(fastapi_app.app) as client:
        response = client.delete("/collections/collection/documents/document")

    assert response.status_code == 404
    assert response.json()["detail"] == "document is not in this collection"
