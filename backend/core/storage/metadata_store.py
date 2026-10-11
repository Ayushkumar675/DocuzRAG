"""SQLite metadata storage for collections and uploaded documents."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
from uuid import uuid4
from typing import Any

from core.schemas import CollectionRecord, DocumentRecord, EvidenceRecord


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


class MetadataStore:
    """Small SQLite repository with explicit schema ownership."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    collection_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    size INTEGER NOT NULL CHECK (size > 0),
                    page_count INTEGER,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    FOREIGN KEY (collection_id) REFERENCES collections(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_documents_collection_id
                    ON documents(collection_id);

                CREATE TABLE IF NOT EXISTS evidence (
                    evidence_id TEXT PRIMARY KEY,
                    collection_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    page_number INTEGER,
                    content_type TEXT NOT NULL,
                    source_reference TEXT NOT NULL,
                    score REAL,
                    text TEXT,
                    image_reference TEXT,
                    section TEXT,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (collection_id) REFERENCES collections(id)
                        ON DELETE CASCADE,
                    FOREIGN KEY (document_id) REFERENCES documents(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_evidence_document_id
                    ON evidence(document_id);

                CREATE TABLE IF NOT EXISTS evaluation_runs (
                    id TEXT PRIMARY KEY,
                    collection_id TEXT,
                    metrics_json TEXT NOT NULL,
                    sample_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (collection_id) REFERENCES collections(id)
                        ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS ingestion_jobs (
                    id TEXT PRIMARY KEY,
                    collection_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_active_ingestion_job
                    ON ingestion_jobs(collection_id)
                    WHERE status IN ('uploading', 'queued', 'processing', 'indexing');
                CREATE TABLE IF NOT EXISTS document_indexes (
                    document_id TEXT PRIMARY KEY,
                    evidence_count INTEGER NOT NULL,
                    indexed_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS learning_artifacts (
                    id TEXT PRIMARY KEY,
                    collection_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    selected_document_ids_json TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_learning_artifacts_collection_type
                    ON learning_artifacts(collection_id, artifact_type, created_at);
                """
            )

    def create_collection(self, name: str) -> CollectionRecord:
        collection = CollectionRecord(
            id=str(uuid4()),
            name=name,
            created_at=_utc_now(),
            document_count=0,
        )
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)",
                (collection.id, collection.name, collection.created_at.isoformat()),
            )
        return collection

    def get_collection(self, collection_id: str) -> CollectionRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT c.id, c.name, c.created_at, COUNT(d.id) AS document_count
                FROM collections AS c
                LEFT JOIN documents AS d ON d.collection_id = c.id
                WHERE c.id = ?
                GROUP BY c.id, c.name, c.created_at
                """,
                (collection_id,),
            ).fetchone()
        return self._collection_from_row(row) if row else None

    def list_collections(self) -> list[CollectionRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT c.id, c.name, c.created_at, COUNT(d.id) AS document_count
                FROM collections AS c
                LEFT JOIN documents AS d ON d.collection_id = c.id
                GROUP BY c.id, c.name, c.created_at
                ORDER BY c.created_at DESC
                """
            ).fetchall()
        return [self._collection_from_row(row) for row in rows]

    def delete_collection(self, collection_id: str) -> bool:
        """Delete collection and cascade all SQLite metadata."""
        with self._connect() as connection:
            connection.execute("DELETE FROM evaluation_runs WHERE collection_id = ?", (collection_id,))
            cursor = connection.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
            return cursor.rowcount > 0

    def add_document(self, document: DocumentRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO documents (
                    id, collection_id, filename, file_type, size, page_count,
                    status, created_at, storage_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document.id,
                    document.collection_id,
                    document.filename,
                    document.file_type,
                    document.size,
                    document.page_count,
                    document.status,
                    document.created_at.isoformat(),
                    document.storage_path,
                ),
            )

    def delete_document(self, document_id: str, collection_id: str | None = None) -> bool:
        """Delete one document and its document-scoped metadata.

        Evidence and document indexes are removed by SQLite foreign-key
        cascades. Learning artifacts store their document scope as JSON rather
        than a foreign key, so dependent artifacts are invalidated explicitly
        in the same transaction.
        """
        with self._connect() as connection:
            document_query = "SELECT collection_id FROM documents WHERE id = ?"
            document_parameters: tuple[str, ...] = (document_id,)
            if collection_id is not None:
                document_query += " AND collection_id = ?"
                document_parameters = (document_id, collection_id)
            document_row = connection.execute(
                document_query, document_parameters
            ).fetchone()
            if document_row is None:
                return False

            target_collection_id = document_row["collection_id"]
            artifact_query = (
                "SELECT id, selected_document_ids_json FROM learning_artifacts "
                "WHERE collection_id = ?"
            )
            artifact_rows = connection.execute(
                artifact_query, (target_collection_id,)
            ).fetchall()
            for artifact in artifact_rows:
                selected = json.loads(artifact["selected_document_ids_json"])
                if selected is None or document_id in selected:
                    connection.execute(
                        "DELETE FROM learning_artifacts WHERE id = ?",
                        (artifact["id"],),
                    )

            query = "DELETE FROM documents WHERE id = ?"
            parameters: tuple[str, ...] = (document_id,)
            if collection_id is not None:
                query += " AND collection_id = ?"
                parameters = (document_id, collection_id)
            cursor = connection.execute(query, parameters)
            return cursor.rowcount > 0

    def list_documents(self, collection_id: str) -> list[DocumentRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, collection_id, filename, file_type, size, page_count,
                       status, created_at, storage_path
                FROM documents
                WHERE collection_id = ?
                ORDER BY created_at DESC
                """,
                (collection_id,),
            ).fetchall()
        return [self._document_from_row(row) for row in rows]

    def get_document(
        self,
        document_id: str,
        collection_id: str | None = None,
    ) -> DocumentRecord | None:
        query = """
            SELECT id, collection_id, filename, file_type, size, page_count,
                   status, created_at, storage_path
            FROM documents
            WHERE id = ?
        """
        parameters: tuple[str, ...] = (document_id,)
        if collection_id is not None:
            query += " AND collection_id = ?"
            parameters = (document_id, collection_id)
        with self._connect() as connection:
            row = connection.execute(query, parameters).fetchone()
        return self._document_from_row(row) if row else None

    def update_document_status(self, document_id: str, status: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE documents SET status = ? WHERE id = ?",
                (status, document_id),
            )

    def clear_evidence(self, document_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM document_indexes WHERE document_id = ?", (document_id,))
            connection.execute(
                "DELETE FROM evidence WHERE document_id = ?",
                (document_id,),
            )

    def create_ingestion_job(self, collection_id: str, status: str = "queued") -> dict[str, Any]:
        job_id = str(uuid4())
        now = _utc_now().isoformat()
        try:
            with self._connect() as connection:
                connection.execute(
                    "INSERT INTO ingestion_jobs (id, collection_id, status, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?)", (job_id, collection_id, status, now, now),
                )
        except sqlite3.IntegrityError as error:
            raise ValueError("Processing or indexing is already running for this collection.") from error
        return self.get_ingestion_job(job_id, collection_id)

    def update_ingestion_job(self, job_id: str, status: str, detail: str = "") -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE ingestion_jobs SET status = ?, detail = ?, updated_at = ? WHERE id = ?",
                (status, detail, _utc_now().isoformat(), job_id),
            )

    def get_ingestion_job(self, job_id: str, collection_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM ingestion_jobs WHERE id = ? AND collection_id = ?",
                (job_id, collection_id),
            ).fetchone()
        return dict(row) if row else None

    def ingestion_status(self, collection_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            job = connection.execute(
                "SELECT * FROM ingestion_jobs WHERE collection_id = ? ORDER BY created_at DESC LIMIT 1",
                (collection_id,),
            ).fetchone()
            indexed_ids = [row[0] for row in connection.execute(
                "SELECT i.document_id FROM document_indexes i JOIN documents d ON d.id=i.document_id "
                "WHERE d.collection_id=? AND d.status='processed'", (collection_id,),
            )]
            count = connection.execute(
                "SELECT COUNT(*) FROM documents WHERE collection_id=?", (collection_id,),
            ).fetchone()[0]
        active = job is not None and job["status"] in {"uploading", "queued", "processing", "indexing"}
        job_dict = dict(job) if job else None
        if job_dict and job_dict.get("created_at") and job_dict.get("updated_at"):
            try:
                c = datetime.fromisoformat(job_dict["created_at"])
                u = datetime.fromisoformat(job_dict["updated_at"])
                job_dict["duration_seconds"] = max(0.0, round((u - c).total_seconds(), 2))
            except Exception:
                job_dict["duration_seconds"] = None
        return {
            "collection_id": collection_id,
            "job": job_dict,
            "busy": active,
            "ready": bool(count) and len(indexed_ids) == count and not active,
            "indexed_document_ids": indexed_ids,
        }

    def mark_documents_indexed(self, collection_id: str, document_ids: list[str]) -> None:
        with self._connect() as connection:
            for document_id in document_ids:
                count = connection.execute(
                    "SELECT COUNT(*) FROM evidence WHERE collection_id=? AND document_id=? AND text IS NOT NULL",
                    (collection_id, document_id),
                ).fetchone()[0]
                if count:
                    connection.execute(
                        "INSERT OR REPLACE INTO document_indexes VALUES (?, ?, ?)",
                        (document_id, count, _utc_now().isoformat()),
                    )

    def invalidate_indexes(self, document_ids: list[str]) -> None:
        with self._connect() as connection:
            connection.executemany("DELETE FROM document_indexes WHERE document_id=?",
                                   [(document_id,) for document_id in document_ids])

    def add_evidence(self, evidence: EvidenceRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO evidence (
                    evidence_id, collection_id, document_id, filename, page_number,
                    content_type, source_reference, score, text, image_reference,
                    section, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evidence.evidence_id,
                    evidence.collection_id,
                    evidence.document_id,
                    evidence.filename,
                    evidence.page_number,
                    evidence.content_type,
                    evidence.source_reference,
                    evidence.score,
                    evidence.text,
                    evidence.image_reference,
                    evidence.section,
                    json.dumps(evidence.metadata, sort_keys=True),
                    _utc_now().isoformat(),
                ),
            )

    def add_evidence_batch(self, evidence_items: list[EvidenceRecord]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO evidence (
                    evidence_id, collection_id, document_id, filename, page_number,
                    content_type, source_reference, score, text, image_reference,
                    section, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        evidence.evidence_id,
                        evidence.collection_id,
                        evidence.document_id,
                        evidence.filename,
                        evidence.page_number,
                        evidence.content_type,
                        evidence.source_reference,
                        evidence.score,
                        evidence.text,
                        evidence.image_reference,
                        evidence.section,
                        json.dumps(evidence.metadata, sort_keys=True),
                        _utc_now().isoformat(),
                    )
                    for evidence in evidence_items
                ],
            )

    def list_evidence(
        self,
        collection_id: str,
        document_id: str | None = None,
    ) -> list[EvidenceRecord]:
        query = """
            SELECT evidence_id, collection_id, document_id, filename, page_number,
                   content_type, source_reference, score, text, image_reference,
                   section, metadata_json
            FROM evidence
            WHERE collection_id = ?
        """
        parameters: tuple[str, ...] = (collection_id,)
        if document_id is not None:
            query += " AND document_id = ?"
            parameters = (collection_id, document_id)
        query += " ORDER BY document_id, evidence_id"
        with self._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [self._evidence_from_row(row) for row in rows]

    def get_evidence(
        self,
        evidence_id: str,
        collection_id: str,
    ) -> EvidenceRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT evidence_id, collection_id, document_id, filename, page_number,
                       content_type, source_reference, score, text, image_reference,
                       section, metadata_json
                FROM evidence
                WHERE evidence_id = ? AND collection_id = ?
                """,
                (evidence_id, collection_id),
            ).fetchone()
        return self._evidence_from_row(row) if row else None

    def save_evaluation(
        self,
        metrics: dict[str, float],
        sample_count: int,
        collection_id: str | None = None,
    ) -> str:
        evaluation_id = str(uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO evaluation_runs
                    (id, collection_id, metrics_json, sample_count, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    evaluation_id,
                    collection_id,
                    json.dumps(metrics, sort_keys=True),
                    sample_count,
                    _utc_now().isoformat(),
                ),
            )
        return evaluation_id

    def list_evaluations(self, collection_id: str | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT id, collection_id, metrics_json, sample_count, created_at
            FROM evaluation_runs
        """
        parameters: tuple[str, ...] = ()
        if collection_id is not None:
            query += " WHERE collection_id = ?"
            parameters = (collection_id,)
        query += " ORDER BY created_at DESC"
        with self._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [
            {
                "id": row["id"],
                "collection_id": row["collection_id"],
                "metrics": json.loads(row["metrics_json"]),
                "sample_count": row["sample_count"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def save_learning_artifact(
        self,
        collection_id: str,
        artifact_type: str,
        payload: dict[str, Any],
        selected_document_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Persist a learning result as metadata plus stable evidence references."""

        artifact = {
            "id": str(uuid4()),
            "collection_id": collection_id,
            "artifact_type": artifact_type,
            "selected_document_ids": selected_document_ids,
            "payload": payload,
            "created_at": _utc_now().isoformat(),
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO learning_artifacts
                    (id, collection_id, artifact_type, selected_document_ids_json,
                     payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact["id"], collection_id, artifact_type,
                    json.dumps(selected_document_ids), json.dumps(payload, sort_keys=True),
                    artifact["created_at"],
                ),
            )
        return artifact

    def get_learning_artifact(
        self, artifact_id: str, collection_id: str | None = None,
    ) -> dict[str, Any] | None:
        query = "SELECT * FROM learning_artifacts WHERE id = ?"
        parameters: tuple[str, ...] = (artifact_id,)
        if collection_id is not None:
            query += " AND collection_id = ?"
            parameters = (artifact_id, collection_id)
        with self._connect() as connection:
            row = connection.execute(query, parameters).fetchone()
        return self._learning_artifact_from_row(row) if row else None

    def latest_learning_artifact(
        self, collection_id: str, artifact_type: str,
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM learning_artifacts "
                "WHERE collection_id = ? AND artifact_type = ? "
                "ORDER BY created_at DESC LIMIT 1",
                (collection_id, artifact_type),
            ).fetchone()
        return self._learning_artifact_from_row(row) if row else None

    def learning_source_version(self, collection_id: str, document_ids: list[str]) -> str:
        """Fingerprint source/index revisions without loading a collection's text."""
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT d.id, d.status, COUNT(e.evidence_id), MAX(e.created_at), i.indexed_at "
                "FROM documents d LEFT JOIN evidence e ON e.document_id=d.id "
                "LEFT JOIN document_indexes i ON i.document_id=d.id "
                "WHERE d.collection_id=? GROUP BY d.id ORDER BY d.id", (collection_id,),
            ).fetchall()
        selected = set(document_ids)
        return hashlib.sha256(json.dumps([list(row) for row in rows if row[0] in selected]).encode()).hexdigest()

    def list_learning_artifacts(self, collection_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM learning_artifacts WHERE collection_id=? ORDER BY created_at DESC LIMIT 100",
                (collection_id,),
            ).fetchall()
        return [self._learning_artifact_from_row(row) for row in rows]

    @staticmethod
    def _learning_artifact_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "collection_id": row["collection_id"],
            "artifact_type": row["artifact_type"],
            "selected_document_ids": json.loads(row["selected_document_ids_json"])
            if row["selected_document_ids_json"] else None,
            "payload": json.loads(row["payload_json"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _collection_from_row(row: sqlite3.Row) -> CollectionRecord:
        return CollectionRecord(
            id=row["id"],
            name=row["name"],
            created_at=_parse_datetime(row["created_at"]),
            document_count=row["document_count"],
        )

    @staticmethod
    def _document_from_row(row: sqlite3.Row) -> DocumentRecord:
        return DocumentRecord(
            id=row["id"],
            collection_id=row["collection_id"],
            filename=row["filename"],
            file_type=row["file_type"],
            size=row["size"],
            page_count=row["page_count"],
            status=row["status"],
            created_at=_parse_datetime(row["created_at"]),
            storage_path=row["storage_path"],
        )

    @staticmethod
    def _evidence_from_row(row: sqlite3.Row) -> EvidenceRecord:
        return EvidenceRecord(
            evidence_id=row["evidence_id"],
            collection_id=row["collection_id"],
            document_id=row["document_id"],
            filename=row["filename"],
            page_number=row["page_number"],
            content_type=row["content_type"],
            source_reference=row["source_reference"],
            score=row["score"],
            text=row["text"],
            image_reference=row["image_reference"],
            section=row["section"],
            metadata=json.loads(row["metadata_json"]),
        )
