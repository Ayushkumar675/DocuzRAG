"""Deterministic contradiction detection for comparable numeric statements."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from core.guardrails.verification import ContradictionStatus
from core.schemas import EvidenceRecord
from core.observability import log_event


VALUE_PATTERN = re.compile(
    r"(?P<label>[A-Za-z][A-Za-z0-9 _-]{1,48}?)\s+"
    r"(?:is|was|were|equals|equaled|=|to)\s*"
    r"(?P<value>-?\d[\d,]*(?:\.\d+)?%?)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ComparableValue:
    subject: str
    value: Decimal
    raw_value: str
    evidence_id: str
    text: str


@dataclass(frozen=True, slots=True)
class Contradiction:
    subject: str
    status: ContradictionStatus
    values: tuple[ComparableValue, ...]
    explanation: str


def detect_contradictions(evidence: list[EvidenceRecord]) -> list[Contradiction]:
    """Find conflicting values for the same normalized statement subject."""

    grouped: dict[str, list[ComparableValue]] = {}
    for item in evidence:
        if not item.text:
            continue
        for match in VALUE_PATTERN.finditer(item.text):
            subject = _normalize_subject(match.group("label"))
            try:
                value = Decimal(match.group("value").replace(",", "").rstrip("%"))
            except InvalidOperation:
                continue
            grouped.setdefault(subject, []).append(
                ComparableValue(
                    subject=subject,
                    value=value,
                    raw_value=match.group("value"),
                    evidence_id=item.evidence_id,
                    text=item.text,
                )
            )

    contradictions: list[Contradiction] = []
    for subject, values in grouped.items():
        distinct_values = {value.value for value in values}
        if len(values) < 2:
            status = ContradictionStatus.UNKNOWN
        elif len(distinct_values) == 1:
            status = ContradictionStatus.CONSISTENT
        else:
            status = ContradictionStatus.CONFLICT
        if status != ContradictionStatus.UNKNOWN:
            contradictions.append(
                Contradiction(
                    subject=subject,
                    status=status,
                    values=tuple(values),
                    explanation=(
                        f"Sources report {'the same' if status == ContradictionStatus.CONSISTENT else 'different'} "
                        f"values for '{subject}'."
                    ),
                )
            )
    log_event(
        "guardrail.contradictions.completed",
        guardrail="contradiction_detection",
        group_count=len(contradictions),
        conflict_count=sum(item.status == ContradictionStatus.CONFLICT for item in contradictions),
    )
    return contradictions


def _normalize_subject(subject: str) -> str:
    words = re.findall(r"[a-z0-9]+", subject.casefold())
    stop_words = {"the", "a", "an", "value", "amount", "number"}
    return " ".join(word for word in words if word not in stop_words)
