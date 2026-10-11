"""Deterministic document comparison with evidence-linked differences."""

from __future__ import annotations

import re
from dataclasses import dataclass

from core.schemas import EvidenceRecord
from core.storage.metadata_store import MetadataStore
from core.observability import observed_service


class ComparisonError(ValueError):
    """Raised when documents cannot be compared within one collection."""


@dataclass(frozen=True, slots=True)
class DocumentDifference:
    key: str
    change_type: str
    before_text: str | None
    after_text: str | None
    before_evidence_ids: tuple[str, ...]
    after_evidence_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ComparisonResult:
    collection_id: str
    before_document_id: str
    after_document_id: str
    differences: tuple[DocumentDifference, ...]


class DocumentComparator:
    """Compare sections, tables, and document-level values without guessing."""

    def __init__(self, metadata_store: MetadataStore) -> None:
        self.metadata_store = metadata_store

    @observed_service("tools.compare_documents")
    def compare(
        self,
        collection_id: str,
        before_document_id: str,
        after_document_id: str,
    ) -> ComparisonResult:
        before = self.metadata_store.get_document(before_document_id, collection_id)
        after = self.metadata_store.get_document(after_document_id, collection_id)
        if before is None or after is None:
            raise ComparisonError("Both documents must belong to the requested collection.")
        before_items = self.metadata_store.list_evidence(collection_id, before_document_id)
        after_items = self.metadata_store.list_evidence(collection_id, after_document_id)
        before_groups = _group_evidence(before_items)
        after_groups = _group_evidence(after_items)
        differences: list[DocumentDifference] = []
        for key in sorted(set(before_groups) | set(after_groups)):
            before_group = before_groups.get(key, [])
            after_group = after_groups.get(key, [])
            before_text = _join_text(before_group)
            after_text = _join_text(after_group)
            if before_text == after_text:
                continue
            if not before_group:
                change_type = "ADDED"
            elif not after_group:
                change_type = "REMOVED"
            else:
                change_type = "CHANGED"
            differences.append(
                DocumentDifference(
                    key=key,
                    change_type=change_type,
                    before_text=before_text,
                    after_text=after_text,
                    before_evidence_ids=tuple(item.evidence_id for item in before_group),
                    after_evidence_ids=tuple(item.evidence_id for item in after_group),
                )
            )
        return ComparisonResult(
            collection_id=collection_id,
            before_document_id=before_document_id,
            after_document_id=after_document_id,
            differences=tuple(differences),
        )


def _group_evidence(items: list[EvidenceRecord]) -> dict[str, list[EvidenceRecord]]:
    groups: dict[str, list[EvidenceRecord]] = {}
    for item in items:
        if item.content_type == "TABLE":
            key = f"table:{item.metadata.get('table_index', item.source_reference)}"
        elif item.section:
            key = f"section:{_normalize(item.section)}"
        else:
            key = f"type:{item.content_type}"
        groups.setdefault(key, []).append(item)
    return groups


def _join_text(items: list[EvidenceRecord]) -> str | None:
    values = [item.text.strip() for item in items if item.text and item.text.strip()]
    return "\n".join(values) if values else None


def _normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))
