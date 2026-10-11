"""PDF text, table, and scanned-page extraction."""

from __future__ import annotations

from pathlib import Path

import pymupdf

from core.ingestion.ocr import try_extract_text_with_engine
from core.ingestion.parser import ParsedItem
from core.ingestion.tables import extract_pdf_tables


def parse_pdf(path: Path, document_id: str, filename: str) -> list[ParsedItem]:
    """Extract page text/tables and OCR scanned pages when OCR is available."""

    items: list[ParsedItem] = []
    with pymupdf.open(path) as document:
        for page_index, page in enumerate(document):
            page_number = page_index + 1
            text = page.get_text("text").strip()
            if text:
                items.append(
                    ParsedItem(
                        content_type="TEXT",
                        text=text,
                        page_number=page_number,
                        source_reference=f"document:{document_id}#page={page_number}",
                        metadata={"format": "pdf"},
                    )
                )

            for table_index, table in enumerate(extract_pdf_tables(page)):
                items.append(
                    ParsedItem(
                        content_type="TABLE",
                        text=table.text,
                        page_number=page_number,
                        source_reference=(
                            f"document:{document_id}#page={page_number}#table={table_index}"
                        ),
                        metadata={"format": "pdf", **table.metadata},
                    )
                )

            if not text:
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
                ocr_text, ocr_status, ocr_engine = try_extract_text_with_engine(
                    pixmap.tobytes("png"), f"{filename}#page-{page_number}.png"
                )
                if ocr_text:
                    items.append(
                        ParsedItem(
                            content_type="OCR",
                            text=ocr_text,
                            page_number=page_number,
                            source_reference=(
                                f"document:{document_id}#page={page_number}#ocr"
                            ),
                            metadata={
                                "format": "pdf",
                                "ocr_engine": ocr_engine,
                                "ocr_status": ocr_status,
                            },
                        )
                    )
    return items
