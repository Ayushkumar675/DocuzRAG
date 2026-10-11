"""Lazy NVIDIA NIM embedding client."""

from __future__ import annotations

from typing import Any
from math import isfinite
import re

from openai import OpenAI

from core.config import AppConfig
from core.observability import observed_service


class EmbeddingServiceError(RuntimeError):
    """Raised when an embedding request or response is invalid."""


class NvidiaEmbeddingClient:
    """Call NVIDIA's OpenAI-compatible embeddings endpoint on demand."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self._client: OpenAI | None = None

    @observed_service("nvidia.embeddings")
    def embed_texts(self, texts: list[str], input_type: str = "passage") -> list[list[float]]:
        """Embed texts while preserving input order and vector dimensions."""

        if not texts:
            return []
        if any(not text.strip() for text in texts):
            raise EmbeddingServiceError("Embedding input contains empty text.")

        client = self._get_client()
        try:
            response = client.embeddings.create(
                model=self.config.embedding_model,
                input=texts,
                encoding_format="float",
                extra_body={"input_type": input_type, "truncate": "NONE"},
            )
        except Exception as error:
            raise EmbeddingServiceError(_embedding_failure_message(error)) from error

        vectors = self._ordered_vectors(response, len(texts))
        if not vectors or any(not vector for vector in vectors):
            raise EmbeddingServiceError("NVIDIA returned an empty embedding vector.")
        dimension = len(vectors[0])
        if any(len(vector) != dimension for vector in vectors):
            raise EmbeddingServiceError("NVIDIA returned inconsistent vector dimensions.")
        return vectors

    def _get_client(self) -> OpenAI:
        if self._client is None:
            api_key = self.config.require_nvidia_api_key()
            self._client = OpenAI(
                api_key=api_key,
                base_url=self.config.nvidia_base_url,
            )
        return self._client

    @staticmethod
    def _ordered_vectors(response: Any, expected_count: int) -> list[list[float]]:
        data = list(getattr(response, "data", []))
        if len(data) != expected_count:
            raise EmbeddingServiceError(
                "NVIDIA returned a different number of vectors than inputs."
            )

        ordered: list[list[float] | None] = [None] * expected_count
        for fallback_index, item in enumerate(data):
            index = getattr(item, "index", fallback_index)
            if not isinstance(index, int) or index < 0 or index >= expected_count:
                raise EmbeddingServiceError("NVIDIA returned an invalid vector index.")
            embedding = getattr(item, "embedding", None)
            if not isinstance(embedding, list) or not all(
                isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)
                for value in embedding
            ):
                raise EmbeddingServiceError("NVIDIA returned an invalid embedding vector.")
            ordered[index] = [float(value) for value in embedding]

        if any(vector is None for vector in ordered):
            raise EmbeddingServiceError("NVIDIA returned duplicate or missing vector indexes.")
        return [vector for vector in ordered if vector is not None]


def _embedding_failure_message(error: Exception) -> str:
    """Build a useful provider error without exposing credentials or headers."""

    status_code = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    provider_message: str | None = None
    if response is not None:
        try:
            body = response.json()
            provider_error = body.get("error") if isinstance(body, dict) else None
            if isinstance(provider_error, dict):
                raw_message = provider_error.get("message")
                if isinstance(raw_message, str):
                    provider_message = raw_message
        except Exception:
            provider_message = None

    if provider_message:
        provider_message = re.sub(r"(?:nvapi-|Bearer\s+)[A-Za-z0-9_.-]+", "[redacted]", provider_message, flags=re.I)
    if status_code is not None and provider_message:
        return f"NVIDIA embedding request failed (HTTP {status_code}): {provider_message}"
    if status_code is not None:
        return f"NVIDIA embedding request failed (HTTP {status_code})."
    return "NVIDIA embedding request failed before a provider response was received."
