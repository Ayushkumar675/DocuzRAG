"""Optional NVIDIA NIM reranking client."""

from __future__ import annotations

from typing import Any
from math import isfinite

import httpx

from core.config import AppConfig, ConfigurationError
from core.observability import observed_service


class RerankerServiceError(RuntimeError):
    """Raised when an NVIDIA reranking response is invalid."""


class NvidiaRerankerClient:
    """Call the configured NVIDIA ranking endpoint lazily."""

    def __init__(self, config: AppConfig, timeout_seconds: float = 60.0) -> None:
        self.config = config
        self.timeout_seconds = timeout_seconds

    @observed_service("nvidia.reranker")
    def rerank(self, query: str, documents: list[str]) -> list[float]:
        if not query.strip():
            raise RerankerServiceError("Reranker query cannot be empty.")
        if not documents:
            return []
        model = self.config.reranker_model
        if not model:
            raise ConfigurationError("NVIDIA_RERANKER_MODEL is not configured.")
        request_model = model
        if model == "llama-nemotron-rerank-vl-1b-v2":
            # NVIDIA's hosted catalog exposes this model under its fully
            # qualified ID, while the project setting intentionally keeps the
            # operator-facing model name requested by the product config.
            request_model = f"nvidia/{model}"
        api_key = self.config.require_provider_api_key("reranker")
        payload = {
            "model": request_model,
            "query": {"text": query},
            "passages": [{"text": text} for text in documents],
            "truncate": "END",
        }
        try:
            response = httpx.post(
                self.config.nvidia_reranker_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            body = response.json()
        except Exception as error:
            raise RerankerServiceError("NVIDIA reranking request failed.") from error
        return self._parse_scores(body, len(documents))

    @staticmethod
    def _parse_scores(body: Any, expected_count: int) -> list[float]:
        entries = body.get("rankings", body.get("data", [])) if isinstance(body, dict) else []
        scores: list[float | None] = [None] * expected_count
        for fallback_index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise RerankerServiceError("NVIDIA returned an invalid ranking entry.")
            index = entry.get("index", fallback_index)
            score = entry.get("logit", entry.get("relevance_score", entry.get("score")))
            if not isinstance(index, int) or not 0 <= index < expected_count:
                raise RerankerServiceError("NVIDIA returned an invalid ranking index.")
            if (
                isinstance(score, bool)
                or not isinstance(score, (int, float))
                or not isfinite(score)
                or scores[index] is not None
            ):
                raise RerankerServiceError("NVIDIA returned an invalid ranking score.")
            scores[index] = float(score)
        if len(entries) != expected_count or any(score is None for score in scores):
            raise RerankerServiceError("NVIDIA returned incomplete ranking scores.")
        return [score for score in scores if score is not None]
