"""Hybrid vector and BM25 retrieval with mandatory scope filtering."""

from __future__ import annotations

import re

from rank_bm25 import BM25Okapi

from core.config import ConfigurationError
from core.guardrails.scope import validate_document_scope
from core.llm.nvidia_embeddings import EmbeddingServiceError, NvidiaEmbeddingClient
from core.retrieval.query import RetrievedEvidence
from core.schemas import EvidenceRecord
from core.storage.metadata_store import MetadataStore
from core.storage.qdrant_store import QdrantStore, QdrantStoreError
from core.observability import log_event, log_span


# Treat underscores in filenames as word separators for source-title searches.
TOKEN_PATTERN = re.compile(r"[^\W_0-9]+|[0-9]+", re.UNICODE)
STOP_WORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
        "how", "in", "is", "it", "of", "on", "or", "that", "the", "this",
        "to", "was", "were", "what", "when", "where", "which", "who", "why",
        "with",
    }
)


def tokenize(text: str) -> list[str]:
    """Tokenize user/document text deterministically for BM25."""

    return [
        token.casefold()
        for token in TOKEN_PATTERN.findall(text)
        if token.casefold() not in STOP_WORDS
    ]


class HybridRetriever:
    """Fuse vector similarity and BM25 keyword scores after scope validation."""

    def __init__(
        self,
        metadata_store: MetadataStore,
        embedding_client: NvidiaEmbeddingClient,
        qdrant_store: QdrantStore,
        vector_weight: float = 0.65,
        mode: str = "hybrid",
    ) -> None:
        if not 0 <= vector_weight <= 1:
            raise ValueError("vector_weight must be between 0 and 1.")
        self.metadata_store = metadata_store
        self.embedding_client = embedding_client
        self.qdrant_store = qdrant_store
        self.vector_weight = vector_weight
        if mode not in {"hybrid", "keyword"}:
            raise ValueError("Retrieval mode must be hybrid or keyword.")
        self.mode = mode

    def retrieve(
        self,
        collection_id: str,
        question: str,
        selected_document_ids: list[str] | None,
        top_k: int,
    ) -> list[RetrievedEvidence]:
        log_event(
            "retrieval.started",
            service="hybrid_retriever",
            collection_id=collection_id,
            selected_document_count=len(selected_document_ids or []),
            guardrails="collection_scope,selected_document_scope",
            mode=self.mode,
        )
        scope = validate_document_scope(
            self.metadata_store,
            collection_id,
            selected_document_ids,
        )
        if not question.strip():
            raise ValueError("Question cannot be empty.")
        if top_k <= 0:
            raise ValueError("top_k must be positive.")

        evidence = self.metadata_store.list_evidence(collection_id)
        if scope is not None:
            evidence = [item for item in evidence if item.document_id in scope]
        if not evidence:
            return []

        with log_span("retrieval.keyword", collection_id=collection_id):
            keyword_hits = self._keyword_hits(evidence, question, top_k * 3)
        if self.mode == "keyword":
            result = _ensure_selected_document_candidates(keyword_hits, evidence, scope)[:top_k]
            log_event(
                "retrieval.completed",
                service="hybrid_retriever",
                status="keyword_only",
                result_count=len(result),
            )
            return result

        try:
            vector_hits = self._vector_hits(collection_id, question, scope, top_k * 2)
        except (ConfigurationError, EmbeddingServiceError, QdrantStoreError):
            # Keyword retrieval is local and remains useful when optional
            # vector services are unavailable. Scope was validated above.
            result = _ensure_selected_document_candidates(keyword_hits, evidence, scope)[:top_k]
            log_event(
                "retrieval.completed",
                service="hybrid_retriever",
                status="keyword_fallback",
                result_count=len(result),
            )
            return result
        combined: dict[str, RetrievedEvidence] = {}

        for item in vector_hits:
            combined[item.evidence.evidence_id] = item
        for item in keyword_hits:
            existing = combined.get(item.evidence.evidence_id)
            if existing is None:
                combined[item.evidence.evidence_id] = item
            else:
                combined[item.evidence.evidence_id] = RetrievedEvidence(
                    evidence=existing.evidence,
                    retrieval_score=existing.retrieval_score,
                    vector_score=existing.vector_score,
                    keyword_score=item.keyword_score,
                    fusion_score=existing.fusion_score,
                )

        if not combined:
            return []

        if scope is not None and len(scope) > 1:
            selected = _ensure_selected_document_candidates(
                list(combined.values()), evidence, scope
            )
            combined = {item.evidence.evidence_id: item for item in selected}

        vector_scores = [item.vector_score or 0.0 for item in combined.values()]
        keyword_scores = [item.keyword_score or 0.0 for item in combined.values()]
        normalized_vector = _normalize_scores(vector_scores)
        normalized_keyword = _normalize_scores(keyword_scores)
        ranked: list[RetrievedEvidence] = []
        for index, item in enumerate(combined.values()):
            vector_score = item.vector_score or 0.0
            keyword_score = item.keyword_score or 0.0
            fusion_score = (
                self.vector_weight * normalized_vector[index]
                + (1 - self.vector_weight) * normalized_keyword[index]
            )
            ranked.append(
                RetrievedEvidence(
                    evidence=item.evidence,
                    retrieval_score=fusion_score,
                    vector_score=vector_score if item.vector_score is not None else None,
                    keyword_score=keyword_score if item.keyword_score is not None else None,
                    fusion_score=fusion_score,
                )
            )
        ranked.sort(
            key=lambda item: (
                item.fusion_score if item.fusion_score is not None else 0.0,
                item.evidence.evidence_id,
            ),
            reverse=True,
        )
        if scope is not None and len(scope) > 1:
            ranked = _ensure_selected_document_candidates(ranked, evidence, scope)
        result = ranked[:top_k]
        log_event(
            "retrieval.completed",
            service="hybrid_retriever",
            status="hybrid",
            result_count=len(result),
        )
        return result

    def _vector_hits(
        self,
        collection_id: str,
        question: str,
        scope: tuple[str, ...] | None,
        limit: int,
    ) -> list[RetrievedEvidence]:
        query_vector = self.embedding_client.embed_texts([question], input_type="query")[0]
        hits = self.qdrant_store.search(
            query_vector=query_vector,
            collection_id=collection_id,
            selected_document_ids=scope,
            limit=limit,
        )
        results: list[RetrievedEvidence] = []
        for hit in hits:
            evidence_id = hit.payload.get("evidence_id")
            if not isinstance(evidence_id, str):
                continue
            evidence = self.metadata_store.get_evidence(evidence_id, collection_id)
            if evidence is None:
                continue
            if scope is not None and evidence.document_id not in scope:
                continue
            results.append(
                RetrievedEvidence(
                    evidence=evidence,
                    retrieval_score=hit.score,
                    vector_score=hit.score,
                )
            )
        return results

    @staticmethod
    def _keyword_hits(
        evidence: list[EvidenceRecord],
        question: str,
        limit: int,
    ) -> list[RetrievedEvidence]:
        textual = [item for item in evidence if item.text and item.text.strip()]
        if not textual:
            return []
        corpus = [tokenize(_searchable_text(item)) for item in textual]
        query_tokens = tokenize(question)
        if not query_tokens:
            return []
        scores = BM25Okapi(corpus).get_scores(query_tokens)
        query_terms = set(query_tokens)
        combined_scores = [
            max(float(score), 0.0)
            + len(query_terms.intersection(tokens)) / max(len(query_terms), 1)
            for score, tokens in zip(scores, corpus, strict=True)
        ]
        ranked_indices = sorted(
            range(len(textual)),
            key=lambda index: (combined_scores[index], textual[index].evidence_id),
            reverse=True,
        )
        return [
            RetrievedEvidence(
                evidence=textual[index],
                retrieval_score=combined_scores[index],
                keyword_score=combined_scores[index],
            )
            for index in ranked_indices[:limit]
            if combined_scores[index] > 0
        ]


def _normalize_scores(scores: list[float]) -> list[float]:
    if not scores:
        return []
    minimum = min(scores)
    maximum = max(scores)
    if maximum == minimum:
        return [1.0 if maximum > 0 else 0.0 for _ in scores]
    return [(score - minimum) / (maximum - minimum) for score in scores]


def _ensure_selected_document_candidates(
    ranked: list[RetrievedEvidence],
    evidence: list[EvidenceRecord],
    scope: tuple[str, ...] | None,
) -> list[RetrievedEvidence]:
    """Reserve one textual candidate per explicitly selected document."""

    if scope is None or len(scope) <= 1:
        return ranked
    ordered = list(ranked)
    seen = {item.evidence.document_id for item in ordered}
    for document_id in scope:
        if document_id in seen:
            continue
        fallback = next(
            (item for item in evidence
             if item.document_id == document_id and item.text and item.text.strip()),
            None,
        )
        if fallback is not None:
            ordered.append(RetrievedEvidence(
                evidence=fallback, retrieval_score=0.0,
                keyword_score=0.0, fusion_score=0.0,
            ))
            seen.add(document_id)
    diverse = [next(item for item in ordered if item.evidence.document_id == document_id)
               for document_id in scope if document_id in seen]
    return diverse + [item for item in ordered if item not in diverse]


def _searchable_text(item: EvidenceRecord) -> str:
    """Include source labels so title/document queries can find their pages."""

    page = f" page {item.page_number}" if item.page_number is not None else ""
    return f"{item.filename}{page}\n{item.text or ''}"
