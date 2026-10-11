"""CSV parsing into bounded, source-preserving table evidence."""

from __future__ import annotations

import csv as csv_module
import json
from pathlib import Path

from core.ingestion.parser import ParsedItem

csv_module.field_size_limit(50 * 1024 * 1024)
# Small row groups keep exact-ID lookups useful while retaining headers on each
# evidence block. The original CSV remains available for full-fidelity viewing.
ROWS_PER_ITEM = 5


def parse_csv(path: Path, document_id: str, filename: str) -> list[ParsedItem]:
    """Represent a CSV as bounded tables with repeated column context.

    Large nested cells stay searchable through compact names/labels while the
    original CSV remains the authoritative source linked by each citation.
    """

    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv_module.reader(handle, strict=True)
        rows = list(reader)
    if not rows:
        return []
    headers = [cell.strip() or f"column_{index + 1}" for index, cell in enumerate(rows[0])]
    data_rows: list[tuple[int, list[str]]] = []
    for row_number, row in enumerate(rows[1:], start=2):
        if len(row) != len(headers):
            raise ValueError(f"CSV record {row_number} does not match its header width.")
        values = [cell.strip() for cell in row]
        if any(values):
            data_rows.append((row_number, _searchable_values(headers, values)))

    items: list[ParsedItem] = []
    for start in range(0, len(data_rows) or 1, ROWS_PER_ITEM):
        batch = data_rows[start : start + ROWS_PER_ITEM]
        if batch:
            first_row, last_row = batch[0][0], batch[-1][0]
            text = "\n".join(
                ["CSV columns: " + " | ".join(headers)]
                + [f"row {number}: " + " | ".join(values) for number, values in batch]
            )
            row_reference = f"rows={first_row}-{last_row}"
        else:
            first_row = last_row = None
            text = "CSV columns: " + " | ".join(headers)
            row_reference = "header"
        items.append(
            ParsedItem(
                content_type="TABLE",
                text=text,
                page_number=None,
                source_reference=f"document:{document_id}#csv={row_reference}",
                section=filename,
                metadata={
                    "format": "csv",
                    "columns": headers,
                    "row_count": len(data_rows),
                    "row_start": first_row,
                    "row_end": last_row,
                    "pre_chunked": True,
                },
            )
        )
    return items


def _searchable_values(headers: list[str], values: list[str]) -> list[str]:
    """Compact movie-credit JSON without losing the original source record."""

    normalized = {header.casefold(): value for header, value in zip(headers, values, strict=True)}
    if not {"movie_id", "title", "cast", "crew"}.issubset(normalized):
        return [f"{header}: {value}" for header, value in zip(headers, values, strict=True)]
    cast = _json_records(normalized["cast"])
    crew = _json_records(normalized["crew"])
    cast_names = [str(item.get("name", "")).strip() for item in cast if item.get("name")]
    crew_labels = [
        f"{item.get('job')}: {item.get('name')}"
        for item in crew
        if item.get("name") and str(item.get("job", "")).casefold()
        in {"director", "screenplay", "story", "writer"}
    ]
    return [
        f"movie_id={normalized['movie_id']}",
        f"title={normalized['title']}",
        "cast=" + ", ".join(dict.fromkeys(cast_names[:8])),
        "crew=" + ", ".join(dict.fromkeys(crew_labels[:8])),
    ]


def _json_records(value: str) -> list[dict[str, object]]:
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
