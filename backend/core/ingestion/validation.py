"""Phase 1 upload validation for supported document formats."""

from __future__ import annotations

from dataclasses import dataclass
import csv as csv_module
from io import BytesIO, StringIO
from pathlib import Path
from zipfile import ZipFile, is_zipfile

from PIL import Image, UnidentifiedImageError
from core.observability import observed_service, log_event


ALLOWED_EXTENSIONS = frozenset({".pdf", ".docx", ".txt", ".md", ".markdown", ".csv", ".png", ".jpg", ".jpeg"})
SENSITIVE_NAME_PARTS = frozenset({"credentials", "credential", "secret", "secrets", "id_rsa"})
SENSITIVE_SUFFIXES = frozenset({".key", ".pem", ".p12", ".pfx"})


class UploadValidationError(ValueError):
    """Raised when an uploaded file is invalid or disallowed."""


@dataclass(frozen=True, slots=True)
class ValidatedFile:
    filename: str
    file_type: str
    content: bytes

    @property
    def size(self) -> int:
        return len(self.content)


@observed_service("guardrails.upload_validation")
def validate_upload(filename: str, content: bytes, max_size_bytes: int) -> ValidatedFile:
    """Validate filename, size, and basic file structure before storage."""

    safe_filename = _validate_filename(filename)
    extension = Path(safe_filename).suffix.casefold()
    if extension not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            f"Unsupported file type '{extension or 'unknown'}'. "
            "Supported types: PDF, DOCX, TXT, MD, CSV, PNG, JPG, JPEG."
        )

    if not content:
        raise UploadValidationError(f"'{safe_filename}' is empty.")
    if len(content) > max_size_bytes:
        raise UploadValidationError(
            f"'{safe_filename}' exceeds the {max_size_bytes} byte upload limit."
        )

    if extension == ".pdf":
        _validate_pdf(safe_filename, content)
    elif extension == ".docx":
        _validate_docx(safe_filename, content)
    elif extension in {".png", ".jpg", ".jpeg"}:
        _validate_image(safe_filename, extension, content)
    elif extension == ".csv":
        _validate_csv(safe_filename, content)
    else:
        _validate_text(safe_filename, content)

    log_event("guardrail.upload_validation.passed", guardrail="upload_validation", status="passed",
              file_type=extension, size_bytes=len(content))
    return ValidatedFile(
        filename=safe_filename,
        file_type=extension.removeprefix("."),
        content=content,
    )


def _validate_filename(filename: str) -> str:
    if not filename or filename in {".", ".."}:
        raise UploadValidationError("A filename is required.")
    if Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise UploadValidationError("Path components are not allowed in filenames.")

    name = Path(filename).name
    normalized = name.casefold()
    if normalized.startswith(".env") or name.startswith("."):
        raise UploadValidationError("Environment files and hidden files are not allowed.")
    if normalized.endswith(tuple(SENSITIVE_SUFFIXES)):
        raise UploadValidationError("Credential and key files are not allowed.")
    if any(part in normalized for part in SENSITIVE_NAME_PARTS):
        raise UploadValidationError("Credential and secret-named files are not allowed.")
    return name


def _validate_pdf(filename: str, content: bytes) -> None:
    if not content.startswith(b"%PDF-"):
        raise UploadValidationError(f"'{filename}' is not a valid PDF file.")


def _validate_docx(filename: str, content: bytes) -> None:
    if not is_zipfile(BytesIO(content)):
        raise UploadValidationError(f"'{filename}' is not a valid DOCX archive.")
    try:
        with ZipFile(BytesIO(content)) as archive:
            names = set(archive.namelist())
    except Exception as error:
        raise UploadValidationError(f"'{filename}' could not be read as DOCX.") from error

    required = {"[Content_Types].xml", "word/document.xml"}
    if not required.issubset(names):
        raise UploadValidationError(f"'{filename}' is missing required DOCX parts.")


def _validate_image(filename: str, extension: str, content: bytes) -> None:
    expected_formats = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG"}
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            if image.format != expected_formats[extension]:
                raise UploadValidationError(
                    f"'{filename}' extension does not match its image format."
                )
    except UploadValidationError:
        raise
    except (UnidentifiedImageError, OSError) as error:
        raise UploadValidationError(f"'{filename}' is not a valid image.") from error


def _validate_text(filename: str, content: bytes) -> None:
    if b"\x00" in content:
        raise UploadValidationError(f"'{filename}' contains binary data.")
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise UploadValidationError(f"'{filename}' is not valid UTF-8 text.") from error


def _validate_csv(filename: str, content: bytes) -> None:
    _validate_text(filename, content)
    csv_module.field_size_limit(50 * 1024 * 1024)
    try:
        reader = csv_module.reader(StringIO(content.decode("utf-8-sig"), newline=""), strict=True)
        header = next(reader, [])
        if not header or not any(cell.strip() for cell in header):
            raise UploadValidationError(f"'{filename}' does not contain a CSV header.")
        for row in reader:
            if row and len(row) != len(header):
                raise UploadValidationError(f"'{filename}' contains a record with a different column count.")
    except csv_module.Error as error:
        raise UploadValidationError(f"'{filename}' is not a valid CSV file.") from error
