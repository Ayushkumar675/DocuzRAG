"""Table extraction helpers for DOCX and PDF sources."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True, slots=True)
class TableExtraction:
    text: str
    metadata: dict[str, Any]


def table_to_text(rows: Iterable[Iterable[Any]]) -> str:
    """Render table cells deterministically without inventing values."""

    rendered_rows: list[str] = []
    for row in rows:
        rendered_rows.append(" | ".join(_clean_cell(cell) for cell in row))
    return "\n".join(row for row in rendered_rows if row.strip())


def extract_docx_tables(document: Any) -> list[TableExtraction]:
    """Extract DOCX table cells and basic dimensions."""

    tables: list[TableExtraction] = []
    for index, table in enumerate(document.tables):
        rows = [[cell.text for cell in row.cells] for row in table.rows]
        text = table_to_text(rows)
        if text:
            tables.append(
                TableExtraction(
                    text=text,
                    metadata={
                        "table_index": index,
                        "row_count": len(rows),
                        "column_count": max((len(row) for row in rows), default=0),
                    },
                )
            )
    return tables


def extract_pdf_tables(page: Any) -> list[TableExtraction]:
    """Use PyMuPDF table detection when available, otherwise return no tables."""

    find_tables = getattr(page, "find_tables", None)
    if find_tables is None:
        return []

    try:
        finder = find_tables()
    except Exception:
        return []

    extracted: list[TableExtraction] = []
    for index, table in enumerate(getattr(finder, "tables", [])):
        try:
            rows = table.extract()
        except Exception:
            continue
        text = table_to_text(rows)
        if text:
            extracted.append(
                TableExtraction(
                    text=text,
                    metadata={
                        "table_index": index,
                        "row_count": len(rows),
                        "column_count": max((len(row) for row in rows), default=0),
                    },
                )
            )
    return extracted


def _clean_cell(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())
