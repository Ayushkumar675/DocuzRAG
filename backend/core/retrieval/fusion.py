"""Evidence fusion without losing source identity or content type."""

from __future__ import annotations

from dataclasses import dataclass

from core.retrieval.query import RetrievedEvidence


@dataclass(frozen=True, slots=True)
class FusedEvidence:
    evidence: RetrievedEvidence
    source_types: tuple[str, ...]
    supporting_evidence_ids: tuple[str, ...]


def fuse_evidence(items: list[RetrievedEvidence], limit: int | None = None) -> list[FusedEvidence]:
    """Deduplicate by evidence ID while retaining all source metadata."""

    grouped: dict[str, list[RetrievedEvidence]] = {}
    for item in items:
        grouped.setdefault(item.evidence.evidence_id, []).append(item)

    fused: list[FusedEvidence] = []
    for evidence_id, matches in grouped.items():
        best = max(
            matches,
            key=lambda item: item.retrieval_score,
        )
        source_types = tuple(sorted({match.evidence.content_type for match in matches}))
        fused.append(
            FusedEvidence(
                evidence=best,
                source_types=source_types,
                supporting_evidence_ids=(evidence_id,),
            )
        )
    fused.sort(key=lambda item: item.evidence.retrieval_score, reverse=True)
    return fused if limit is None else fused[:limit]
