"""Tesseract 5 OCR for images and rendered scanned-document pages."""

from __future__ import annotations

import shutil
from io import BytesIO
from functools import lru_cache

from PIL import Image
import pytesseract

from core.config import AppConfig, get_config


class OCRUnavailableError(RuntimeError):
    """Raised when the local OCR executable is not configured."""


def ocr_available(config: AppConfig | None = None) -> bool:
    """Return whether a configured Tesseract 5 executable is usable."""

    runtime_config = config or get_config()
    executable = runtime_config.tesseract_cmd or "tesseract"
    resolved = shutil.which(executable)
    if resolved is None:
        return False
    try:
        major = _tesseract_major_version(resolved)
    except (OSError, RuntimeError, ValueError):
        return False
    return major >= 5


@lru_cache(maxsize=16)
def _tesseract_major_version(executable: str) -> int:
    """Read the executable's major version without exposing command output."""

    import subprocess

    completed = subprocess.run(
        [executable, "--version"],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    )
    first_line = (completed.stdout or completed.stderr).splitlines()[0]
    raw_version = first_line.removeprefix("tesseract ").lstrip("vV").split()[0]
    return int(raw_version.split(".", 1)[0])


def extract_text_from_image(image: Image.Image, config: AppConfig | None = None) -> str:
    """Run OCR or fail clearly without treating OCR output as direct text."""

    runtime_config = config or get_config()
    if runtime_config.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = runtime_config.tesseract_cmd
    if not ocr_available(runtime_config):
        raise OCRUnavailableError(
            "Tesseract 5 is unavailable because the Tesseract executable is not installed."
        )
    prepared = image.convert("RGB")
    try:
        return pytesseract.image_to_string(
            prepared, lang=runtime_config.tesseract_lang, config="--psm 6"
        ).strip()
    finally:
        prepared.close()


def try_extract_text_from_bytes(
    content: bytes,
    filename: str = "document.png",
    config: AppConfig | None = None,
) -> tuple[str | None, str]:
    """Return Tesseract text and status while preserving the parser contract."""

    text, status, _ = try_extract_text_with_engine(content, filename, config)
    return text, status


def try_extract_text_with_engine(
    content: bytes,
    filename: str = "document.png",
    config: AppConfig | None = None,
) -> tuple[str | None, str, str | None]:
    """Return OCR text, status, and the local Tesseract engine."""

    runtime_config = config or get_config()
    if not ocr_available(runtime_config):
        return None, "unavailable", None
    try:
        with Image.open(BytesIO(content)) as image:
            text = extract_text_from_image(image, runtime_config)
    except Exception:
        return None, "failed", "tesseract"
    return (text or None), "complete", "tesseract"
