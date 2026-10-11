"""Plain-text and Markdown parsing."""

from __future__ import annotations

from pathlib import Path

from core.ingestion.parser import ParsedItem


def parse_text(path: Path, document_id: str, filename: str) -> list[ParsedItem]:
    """Read UTF-8 text while preserving the document-level source reference."""

    text = path.read_text(encoding="utf-8-sig")
    if not text.strip():
        return []
    return [
        ParsedItem(
            content_type="TEXT",
            text=text,
            page_number=None,
            source_reference=f"document:{document_id}#file",
            metadata={"format": path.suffix.casefold().removeprefix(".")},
        )
    ]
