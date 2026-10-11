"""Evaluation result assembly from real retrieval and answer runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence
from core.observability import observed_service

from core.evaluation.metrics import (
    answerability_accuracy,
    average_latency_ms,
    citation_coverage,
    contradiction_rate,
    faithfulness,
    mean_reciprocal_rank,
    precision_at_k,
    recall,
    tool_success_rate,
)


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    metrics: dict[str, float]
    sample_count: int


@observed_service("evaluation.run")
def evaluate_run(
    retrieved_ids: Sequence[str],
    relevant_ids: Sequence[str],
    ranked_runs: Sequence[Sequence[str]],
    claims: Sequence[object],
    contradiction_statuses: Sequence[str],
    predicted_answerability: Sequence[str],
    expected_answerability: Sequence[str],
    latencies_ms: Sequence[float],
    tool_successes: Sequence[bool],
    k: int = 5,
) -> EvaluationResult:
    """Return metrics computed from supplied observations; never fabricate them."""

    return EvaluationResult(
        metrics={
            "recall": recall(retrieved_ids, relevant_ids),
            "precision_at_k": precision_at_k(retrieved_ids, relevant_ids, k),
            "mrr": mean_reciprocal_rank(ranked_runs, relevant_ids),
            "citation_coverage": citation_coverage(claims),
            "faithfulness": faithfulness(claims),
            "contradiction_rate": contradiction_rate(contradiction_statuses),
            "answerability_accuracy": answerability_accuracy(
                predicted_answerability,
                expected_answerability,
            ),
            "latency_ms": average_latency_ms(latencies_ms),
            "tool_success_rate": tool_success_rate(tool_successes),
        },
        sample_count=max(
            len(retrieved_ids),
            len(claims),
            len(predicted_answerability),
            len(latencies_ms),
        ),
    )
