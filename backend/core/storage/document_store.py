"""Filesystem storage for original uploaded documents."""

from __future__ import annotations

from pathlib import Path


class DocumentStore:
    """Store originals under generated IDs, never under user-controlled paths."""

    def __init__(self, root_path: Path) -> None:
        self.root_path = root_path
        self.root_path.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        collection_id: str,
        document_id: str,
        filename: str,
        content: bytes,
    ) -> str:
        collection_path = self.root_path / collection_id
        collection_path.mkdir(parents=True, exist_ok=True)

        suffix = Path(filename).suffix.lower()
        destination = collection_path / f"{document_id}{suffix}"
        destination.write_bytes(content)
        return destination.relative_to(self.root_path).as_posix()

    def remove(self, relative_path: str) -> None:
        self.path_for(relative_path).unlink(missing_ok=True)

    def remove_collection(self, collection_id: str) -> None:
        """Remove an entire collection directory."""
        import shutil
        collection_path = (self.root_path / collection_id).resolve()
        try:
            collection_path.relative_to(self.root_path.resolve())
        except ValueError as error:
            raise ValueError("Collection path escaped document store") from error
        if collection_path.exists():
            shutil.rmtree(collection_path)

    def path_for(self, relative_path: str) -> Path:
        """Resolve a database-owned relative path inside the document store."""

        root = self.root_path.resolve()
        path = (root / relative_path).resolve()
        try:
            path.relative_to(root)
        except ValueError as error:
            raise ValueError("Storage path escaped document store") from error
        return path

    def read(self, relative_path: str) -> bytes:
        return self.path_for(relative_path).read_bytes()
