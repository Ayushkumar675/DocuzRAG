"""Image loading and optional OCR evidence."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from core.ingestion.ocr import try_extract_text_with_engine
from core.ingestion.parser import ParsedItem


def parse_image(path: Path, document_id: str, filename: str) -> list[ParsedItem]:
    """Preserve the image as evidence and add OCR only when available."""

    content = path.read_bytes()
    with Image.open(path) as image:
        image_format = image.format or path.suffix.removeprefix(".").upper()
        width, height = image.size

    image_reference = f"document:{document_id}#image=original"
    items = [
        ParsedItem(
            content_type="IMAGE",
            text=None,
            page_number=None,
            source_reference=image_reference,
            image_reference=image_reference,
            metadata={
                "format": image_format,
                "width": width,
                "height": height,
                "filename": filename,
            },
        )
    ]

    ocr_text, ocr_status, ocr_engine = try_extract_text_with_engine(content, filename)
    items[0].metadata["ocr_status"] = ocr_status
    if ocr_text:
        items.append(
            ParsedItem(
                content_type="OCR",
                text=ocr_text,
                page_number=None,
                source_reference=f"document:{document_id}#image=original#ocr",
                image_reference=image_reference,
                metadata={"ocr_engine": ocr_engine, "ocr_status": ocr_status},
            )
        )
    return items
