"""Small Phase 0 bootstrap helpers."""

from __future__ import annotations

from core.config import AppConfig


def ensure_storage_directories(config: AppConfig) -> None:
    """Create only the application-owned storage directories."""

    config.metadata_db_path.parent.mkdir(parents=True, exist_ok=True)
    config.document_store_path.mkdir(parents=True, exist_ok=True)
    config.processed_store_path.mkdir(parents=True, exist_ok=True)
    config.index_store_path.mkdir(parents=True, exist_ok=True)
