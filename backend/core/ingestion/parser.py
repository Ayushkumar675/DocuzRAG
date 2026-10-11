"""Format dispatch and shared parsed-item representation."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

@dataclass(frozen=True, slots=True)
class ParsedItem:
    """A source-preserving item produced by a format parser."""

    content_type: str
    text: str | None
    page_number: int | None
    source_reference: str
    image_reference: str | None = None
    section: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class UnsupportedDocumentTypeError(ValueError):
    """Raised when no Phase 2 parser supports a document extension."""


def parse_document(
    path: Path,
    document_id: str,
    filename: str,
) -> list[ParsedItem]:
    """Dispatch a stored document to its explicit format parser."""

    # Imports stay local so individual format modules can use ParsedItem
    # without creating an import cycle through this dispatcher.
    from core.ingestion.docx import parse_docx
    from core.ingestion.csv import parse_csv
    from core.ingestion.images import parse_image
    from core.ingestion.pdf import parse_pdf
    from core.ingestion.txt import parse_text

    extension = path.suffix.casefold()
    if extension == ".pdf":
        return parse_pdf(path, document_id, filename)
    if extension == ".docx":
        return parse_docx(path, document_id, filename)
    if extension == ".csv":
        return parse_csv(path, document_id, filename)
    if extension in {".txt", ".md"}:
        return parse_text(path, document_id, filename)
    if extension in {".png", ".jpg", ".jpeg"}:
        return parse_image(path, document_id, filename)
    raise UnsupportedDocumentTypeError(
        f"No Phase 2 parser is registered for '{extension or 'unknown'}'."
    )
