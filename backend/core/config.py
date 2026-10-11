"""Environment-backed configuration for DocuNova.

This module deliberately does not log or expose secret values. The NVIDIA API
key is optional while the application is starting, but any model-dependent
operation must call :meth:`AppConfig.require_nvidia_api_key` first.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ConfigurationError(RuntimeError):
    """Raised when a dependent operation lacks required configuration."""


def _optional_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _required_or_default(name: str, default: str) -> str:
    return _optional_env(name) or default


def _project_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else PROJECT_ROOT / path


def _positive_int_env(name: str, default: int) -> int:
    raw_value = _optional_env(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be a positive integer.") from error
    if value <= 0:
        raise ConfigurationError(f"{name} must be a positive integer.")
    return value


def _positive_float_env(name: str, default: float) -> float:
    raw_value = _optional_env(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be a positive number.") from error
    if value <= 0:
        raise ConfigurationError(f"{name} must be a positive number.")
    return value


@dataclass(frozen=True, slots=True)
class AppConfig:
    """Runtime configuration with safe access to sensitive settings."""

    nvidia_api_key: str | None = field(repr=False)
    nvidia_base_url: str
    reasoning_model: str
    reasoning_fallback_model: str | None
    embedding_model: str
    reranker_model: str | None
    vision_model: str | None
    qdrant_url: str
    qdrant_collection: str
    metadata_db_path: Path
    document_store_path: Path
    processed_store_path: Path
    index_store_path: Path
    max_upload_size_bytes: int
    retrieval_mode: str = "hybrid"
    frontend_origin: str = "http://localhost:3000"
    qdrant_api_key: str | None = field(default=None, repr=False)
    nvidia_reranker_api_key: str | None = field(default=None, repr=False)
    nvidia_reranker_url: str = (
        "https://ai.api.nvidia.com/v1/retrieval/nvidia/"
        "llama-nemotron-rerank-vl-1b-v2/reranking"
    )
    nvidia_vision_url: str = "https://integrate.api.nvidia.com/v1/chat/completions"
    vision_fallback_model: str | None = "meta/llama-3.2-11b-vision-instruct"
    vision_timeout_seconds: float = 30.0
    tesseract_cmd: str | None = None
    tesseract_lang: str = "eng"
    learning_max_cards: int = 30
    learning_max_questions: int = 20
    learning_max_nodes: int = 40
    learning_max_edges: int = 80
    learning_context_chars: int = 16000
    learning_output_chars: int = 60000

    @property
    def nvidia_configured(self) -> bool:
        """Return whether an NVIDIA API key is available without exposing it."""

        return self.nvidia_api_key is not None

    @property
    def nvidia_reranker_configured(self) -> bool:
        return self.nvidia_reranker_api_key is not None

    def require_nvidia_api_key(self) -> str:
        """Return the key for a dependent operation or fail safely."""

        if self.nvidia_api_key is None:
            raise ConfigurationError(
                "NVIDIA_API_KEY is not configured; model-dependent operation stopped."
            )
        return self.nvidia_api_key

    def require_provider_api_key(self, provider: str) -> str:
        """Return a provider-specific key without exposing its value."""

        keys = {
            "reranker": self.nvidia_reranker_api_key,
        }
        key = keys.get(provider)
        if key is None:
            raise ConfigurationError(
                f"NVIDIA_{provider.upper()}_API_KEY is not configured; "
                "model-dependent operation stopped."
            )
        return key


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    """Load configuration once, preferring process environment variables."""

    load_dotenv(PROJECT_ROOT / "backend" / ".env", override=False)
    load_dotenv(PROJECT_ROOT / ".env", override=False)

    return AppConfig(
        nvidia_api_key=_optional_env("NVIDIA_API_KEY"),
        nvidia_base_url=_required_or_default(
            "NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"
        ),
        reasoning_model=_required_or_default(
            "NVIDIA_REASONING_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"
        ),
        reasoning_fallback_model=_optional_env("NVIDIA_REASONING_FALLBACK_MODEL")
        or "nvidia/nemotron-3-super-120b-a12b",
        embedding_model=_required_or_default(
            "NVIDIA_EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b"
        ),
        reranker_model=_required_or_default(
            "NVIDIA_RERANKER_MODEL", "nvidia/llama-nemotron-rerank-vl-1b-v2"
        ),
        vision_model=_required_or_default(
            "NVIDIA_VISION_MODEL", "meta/llama-3.2-90b-vision-instruct"
        ),
        qdrant_url=_required_or_default("QDRANT_URL", "http://localhost:6335"),
        qdrant_collection=_required_or_default("QDRANT_COLLECTION", "docuzrag"),
        metadata_db_path=_project_path(
            _required_or_default("METADATA_DB_PATH", "./data/docuzrag.db")
        ),
        document_store_path=_project_path(
            _required_or_default("DOCUMENT_STORE_PATH", "./data/documents")
        ),
        processed_store_path=_project_path(
            _required_or_default("PROCESSED_STORE_PATH", "./data/processed")
        ),
        index_store_path=_project_path(
            _required_or_default("INDEX_STORE_PATH", "./data/indexes")
        ),
        max_upload_size_bytes=_positive_int_env(
            "MAX_UPLOAD_SIZE_BYTES", 50 * 1024 * 1024
        ),
        retrieval_mode=_required_or_default("RETRIEVAL_MODE", "hybrid"),
        frontend_origin=_required_or_default("FRONTEND_ORIGIN", "http://localhost:3000"),
        qdrant_api_key=_optional_env("QDRANT_API_KEY"),
        nvidia_reranker_api_key=_optional_env("NVIDIA_RERANKER_API_KEY"),
        nvidia_reranker_url=_required_or_default(
            "NVIDIA_RERANKER_URL",
            "https://ai.api.nvidia.com/v1/retrieval/nvidia/"
            "llama-nemotron-rerank-vl-1b-v2/reranking",
        ),
        nvidia_vision_url=_required_or_default(
            "NVIDIA_VISION_URL", "https://integrate.api.nvidia.com/v1/chat/completions"
        ),
        vision_fallback_model=_optional_env("NVIDIA_VISION_FALLBACK_MODEL")
        or "meta/llama-3.2-11b-vision-instruct",
        vision_timeout_seconds=_positive_float_env("NVIDIA_VISION_TIMEOUT_SECONDS", 30.0),
        tesseract_cmd=_optional_env("TESSERACT_CMD"),
        tesseract_lang=_required_or_default("TESSERACT_LANG", "eng"),
        learning_max_cards=_positive_int_env("LEARNING_MAX_CARDS", 30),
        learning_max_questions=_positive_int_env("LEARNING_MAX_QUESTIONS", 20),
        learning_max_nodes=_positive_int_env("LEARNING_MAX_NODES", 40),
        learning_max_edges=_positive_int_env("LEARNING_MAX_EDGES", 80),
        learning_context_chars=_positive_int_env("LEARNING_CONTEXT_CHARS", 16000),
        learning_output_chars=_positive_int_env("LEARNING_OUTPUT_CHARS", 60000),
    )
