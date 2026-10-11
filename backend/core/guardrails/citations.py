"""Citation extraction and validation against retrieved evidence."""

from __future__ import annotations

import re
from dataclasses import dataclass

from core.observability import log_event


CITATION_PATTERN = re.compile(r"\[evidence:([A-Za-z0-9_-]+)\]")


@dataclass(frozen=True, slots=True)
class CitationValidation:
    citation_ids: tuple[str, ...]
    invalid_ids: tuple[str, ...]

    @property
    def valid(self) -> bool:
        return bool(self.citation_ids) and not self.invalid_ids


def validate_citations(answer: str, retrieved_ids: set[str]) -> CitationValidation:
    """Accept only citations pointing to current retrieved evidence objects."""

    citation_ids = tuple(dict.fromkeys(CITATION_PATTERN.findall(answer)))
    invalid_ids = tuple(citation_id for citation_id in citation_ids if citation_id not in retrieved_ids)
    result = CitationValidation(citation_ids=citation_ids, invalid_ids=invalid_ids)
    log_event(
        "guardrail.citations.completed",
        guardrail="citation_validation",
        status="passed" if result.valid else "failed",
        citation_count=len(result.citation_ids),
        invalid_count=len(result.invalid_ids),
    )
    return result
