"""Reranking adapters and score-preserving retrieval wrapper."""

from __future__ import annotations

from typing import Protocol

from core.retrieval.hybrid import tokenize
from core.retrieval.query import RetrievedEvidence


class Reranker(Protocol):
    def rerank(self, query: str, documents: list[str]) -> list[float]: ...


class LexicalReranker:
    """Deterministic local fallback used until NVIDIA reranking is configured."""

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        query_tokens = set(tokenize(query))
        if not query_tokens:
            return [0.0 for _ in documents]
        scores: list[float] = []
        for document in documents:
            document_tokens = set(tokenize(document))
            scores.append(len(query_tokens.intersection(document_tokens)) / len(query_tokens))
        return scores


class FallbackReranker:
    """Use a provider reranker when available and lexical ranking on failure."""

    def __init__(self, primary: Reranker, fallback: Reranker | None = None) -> None:
        self.primary = primary
        self.fallback = fallback or LexicalReranker()

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        try:
            return self.primary.rerank(query, documents)
        except Exception:
            return self.fallback.rerank(query, documents)


class RerankedRetriever:
    """Apply an explicit reranker to hybrid candidates and retain all scores."""

    def __init__(self, base_retriever: object, reranker: Reranker, candidate_multiplier: int = 3) -> None:
        if candidate_multiplier <= 0:
            raise ValueError("candidate_multiplier must be positive.")
        self.base_retriever = base_retriever
        self.reranker = reranker
        self.candidate_multiplier = candidate_multiplier

    def retrieve(
        self,
        collection_id: str,
        question: str,
        selected_document_ids: list[str] | None,
        top_k: int,
    ) -> list[RetrievedEvidence]:
        candidates = self.base_retriever.retrieve(
            collection_id=collection_id,
            question=question,
            selected_document_ids=selected_document_ids,
            top_k=top_k * self.candidate_multiplier,
        )
        if not candidates:
            return []
        scores = self.reranker.rerank(
            question,
            [_reranker_text(item) for item in candidates],
        )
        if len(scores) != len(candidates):
            raise ValueError("Reranker returned a different number of scores than candidates.")
        reranked = [
            RetrievedEvidence(
                evidence=item.evidence,
                retrieval_score=float(score),
                vector_score=item.vector_score,
                keyword_score=item.keyword_score,
                fusion_score=item.fusion_score,
                rerank_score=float(score),
            )
            for item, score in zip(candidates, scores, strict=True)
        ]
        # Stable ties retain the base retriever's relevance order rather than
        # sorting by random evidence UUIDs.
        reranked.sort(key=lambda item: item.rerank_score, reverse=True)
        if selected_document_ids and len(set(selected_document_ids)) > 1:
            # A multi-document query must retain at least one candidate from
            # every selected document when the candidate pool contains it.
            diverse: list[RetrievedEvidence] = []
            seen_documents: set[str] = set()
            for item in reranked:
                document_id = item.evidence.document_id
                if document_id not in seen_documents:
                    diverse.append(item)
                    seen_documents.add(document_id)
            diverse_ids = {item.evidence.evidence_id for item in diverse}
            reranked = diverse + [
                item for item in reranked if item.evidence.evidence_id not in diverse_ids
            ]
        return reranked[:top_k]


def _reranker_text(item: RetrievedEvidence) -> str:
    evidence = item.evidence
    page = f" page {evidence.page_number}" if evidence.page_number is not None else ""
    return f"{evidence.filename}\n{page}\n{evidence.text or ''}"
