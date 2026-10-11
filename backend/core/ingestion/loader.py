"""Load stored originals and dispatch them through Phase 2 parsers."""

from __future__ import annotations

from core.ingestion.parser import ParsedItem, parse_document
from core.schemas import DocumentRecord
from core.storage.document_store import DocumentStore


class DocumentLoader:
    """Read only document paths that were created by DocumentStore."""

    def __init__(self, document_store: DocumentStore) -> None:
        self.document_store = document_store

    def parse(self, document: DocumentRecord) -> list[ParsedItem]:
        path = self.document_store.path_for(document.storage_path)
        return parse_document(path, document.id, document.filename)
