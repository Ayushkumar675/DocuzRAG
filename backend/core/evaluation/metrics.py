"""Deterministic evaluation metrics computed only from supplied run data."""

from __future__ import annotations

from collections.abc import Iterable, Sequence


def recall(retrieved_ids: Iterable[str], relevant_ids: Iterable[str]) -> float:
    retrieved = set(retrieved_ids)
    relevant = set(relevant_ids)
    return len(retrieved & relevant) / len(relevant) if relevant else 0.0


def precision_at_k(retrieved_ids: Sequence[str], relevant_ids: Iterable[str], k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive.")
    relevant = set(relevant_ids)
    top_k = list(retrieved_ids[:k])
    return sum(item in relevant for item in top_k) / len(top_k) if top_k else 0.0


def mean_reciprocal_rank(ranked_runs: Iterable[Sequence[str]], relevant_ids: Iterable[str]) -> float:
    relevant = set(relevant_ids)
    reciprocal_ranks: list[float] = []
    for run in ranked_runs:
        rank = next(
            (index for index, item in enumerate(run, start=1) if item in relevant),
            None,
        )
        reciprocal_ranks.append(1 / rank if rank else 0.0)
    return sum(reciprocal_ranks) / len(reciprocal_ranks) if reciprocal_ranks else 0.0


def citation_coverage(claims: Iterable[object]) -> float:
    claims_list = list(claims)
    if not claims_list:
        return 0.0
    cited = sum(
        bool(claim.get("evidence_ids", ()))
        if isinstance(claim, dict)
        else bool(getattr(claim, "evidence_ids", ()))
        for claim in claims_list
    )
    return cited / len(claims_list)


def faithfulness(claims: Iterable[object]) -> float:
    claims_list = list(claims)
    if not claims_list:
        return 0.0
    verified = sum(
        bool(claim.get("verified", False))
        if isinstance(claim, dict)
        else bool(getattr(claim, "verified", False))
        for claim in claims_list
    )
    return verified / len(claims_list)


def contradiction_rate(statuses: Iterable[str]) -> float:
    values = list(statuses)
    if not values:
        return 0.0
    return sum(status == "CONFLICT" for status in values) / len(values)


def answerability_accuracy(predicted: Sequence[str], expected: Sequence[str]) -> float:
    if len(predicted) != len(expected):
        raise ValueError("Predicted and expected answerability lengths must match.")
    return (
        sum(actual == target for actual, target in zip(predicted, expected, strict=True))
        / len(expected)
        if expected
        else 0.0
    )


def average_latency_ms(latencies_ms: Iterable[float]) -> float:
    values = list(latencies_ms)
    if any(value < 0 for value in values):
        raise ValueError("Latency values cannot be negative.")
    return sum(values) / len(values) if values else 0.0


def tool_success_rate(successes: Iterable[bool]) -> float:
    values = list(successes)
    return sum(values) / len(values) if values else 0.0
