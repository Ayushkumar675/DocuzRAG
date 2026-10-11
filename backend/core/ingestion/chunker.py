"""Deterministic, source-preserving text chunking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.ingestion.parser import ParsedItem
from core.guardrails.pii import redact_pii, detect_pii_types, is_sensitive_filename, contains_high_risk_pii


@dataclass(frozen=True, slots=True)
class EvidenceChunk:
    content_type: str
    text: str | None
    page_number: int | None
    source_reference: str
    image_reference: str | None
    section: str | None
    metadata: dict[str, Any]


def chunk_item(
    item: ParsedItem,
    max_chars: int = 1200,
    overlap_chars: int = 120,
) -> list[EvidenceChunk]:
    """Chunk text without losing page, section, or source identity."""

    if item.text is None:
        return [
            EvidenceChunk(
                content_type=item.content_type,
                text=None,
                page_number=item.page_number,
                source_reference=item.source_reference,
                image_reference=item.image_reference,
                section=item.section,
                metadata=dict(item.metadata),
            )
        ]
    if max_chars <= 0 or overlap_chars < 0 or overlap_chars >= max_chars:
        raise ValueError("Chunk size must be positive and overlap must be smaller than it.")

    normalized = item.text.strip()
    if not normalized:
        return []
    if len(normalized) <= max_chars or item.metadata.get("pre_chunked"):
        return [
            _chunk_from_item(item, normalized, 0, len(normalized), 0)
        ]

    chunks: list[EvidenceChunk] = []
    start = 0
    chunk_index = 0
    while start < len(normalized):
        end = min(start + max_chars, len(normalized))
        if end < len(normalized):
            boundary = normalized.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunk_text = normalized[start:end].strip()
        if chunk_text:
            chunks.append(_chunk_from_item(item, chunk_text, start, end, chunk_index))
            chunk_index += 1
        if end >= len(normalized):
            break
        start = max(end - overlap_chars, start + 1)
    return chunks


def _chunk_from_item(
    item: ParsedItem,
    text: str,
    start: int,
    end: int,
    chunk_index: int,
) -> EvidenceChunk:
    metadata = dict(item.metadata)
    pii_types = detect_pii_types(text)
    if pii_types:
        metadata["has_pii"] = True
        metadata["pii_types"] = pii_types
        fname = item.metadata.get("filename", "") or item.source_reference
        if is_sensitive_filename(fname) or (
            any(t in {"aadhaar", "pan", "bank_account", "bank_transaction"} for t in pii_types)
            and contains_high_risk_pii(text)
        ):
            metadata["is_sensitive_id_document"] = True
            metadata["is_sensitive_document"] = True
        text = redact_pii(text)

    metadata.update(
        {
            "chunk_index": chunk_index,
            "char_start": start,
            "char_end": end,
        }
    )
    return EvidenceChunk(
        content_type=item.content_type,
        text=text,
        page_number=item.page_number,
        source_reference=f"{item.source_reference}#chunk={chunk_index}",
        image_reference=item.image_reference,
        section=item.section,
        metadata=metadata,
    )

