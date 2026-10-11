"""Collection and selected-document scope validation."""

from __future__ import annotations

from core.storage.metadata_store import MetadataStore
from core.observability import log_event


class ScopeViolationError(ValueError):
    """Raised when a query requests documents outside its collection."""


def validate_document_scope(
    metadata_store: MetadataStore,
    collection_id: str,
    selected_document_ids: list[str] | None,
) -> tuple[str, ...] | None:
    """Validate selected documents before any vector search occurs."""

    if metadata_store.get_collection(collection_id) is None:
        log_event("guardrail.scope.failed", guardrail="collection_scope", status="missing_collection")
        raise ScopeViolationError(f"Collection '{collection_id}' was not found.")
    if selected_document_ids is None:
        log_event("guardrail.scope.passed", guardrail="collection_scope",
                  status="passed", scope="all_documents")
        return None
    if not selected_document_ids:
        log_event("guardrail.scope.failed", guardrail="selected_document_scope", status="empty_scope")
        raise ScopeViolationError("At least one selected document is required.")

    unique_ids = tuple(dict.fromkeys(selected_document_ids))
    unauthorized = [
        document_id
        for document_id in unique_ids
        if metadata_store.get_document(document_id, collection_id) is None
    ]
    if unauthorized:
        log_event(
            "guardrail.scope.failed",
            guardrail="selected_document_scope",
            status="unauthorized_document",
            unauthorized_count=len(unauthorized),
        )
        raise ScopeViolationError(
            "One or more selected documents are outside the requested collection."
        )
    log_event(
        "guardrail.scope.passed",
        guardrail="collection_scope,selected_document_scope",
        selected_document_count=len(unique_ids),
    )
    return unique_ids
