# DocuzRAG — Development Phases

## Phase 0 — Setup
Python project, NVIDIA config, Qdrant, Streamlit, FastAPI, `.env.example`, `.gitignore`.
Guardrails: no hard-coded/logged/committed secrets.

## Phase 1 — Multi-File Upload
PDF, DOCX, TXT, MD, CSV, PNG, JPG, JPEG.
Validate files, create collection, assign IDs.
Guardrails: reject invalid files; never index `.env` or secrets.

## Phase 2 — Processing
PDF/DOCX/TXT/MD/CSV parsers, image loading, local Tesseract 5 OCR, tables, chunking.
Every evidence item retains source metadata.

## Phase 3 — Embeddings + Qdrant
NVIDIA embeddings, vectors and payloads in the dedicated `docuzrag-qdrant`
instance on host port 6335. The existing `docurag-final` instance is preserved
and is not an application dependency.
Guardrail: source metadata stays attached to vectors.

## Phase 4 — Single + Multi-Document RAG
Retrieval, context construction, NVIDIA reasoning, PDF+image milestone.
Guardrails: evidence required, abstention, citation validation, scope.

## Phase 5 — Hybrid Retrieval
Vector + BM25/keyword + metadata filtering.
Guardrail: only permitted documents are searchable.

## Phase 6 — Reranking
NVIDIA reranker and score tracking.

## Phase 7 — OCR + Vision
Local Tesseract 5 OCR plus NVIDIA VLM for typed visual inference, charts, and
images. Vision and reasoning use bounded smaller-model fallbacks after
retryable provider failures.
Guardrail: distinguish OCR, vision, image, table, and text evidence.

## Phase 8 — Agentic Router
Search, vision, calculation, comparison, verification agents.
Guardrail: explicit tool allowlist; no arbitrary execution.

## Phase 9 — Evidence Fusion
Combine text, tables, OCR, images, vision, cross-document evidence.
Guardrail: preserve source identity.

## Phase 10 — Verification + Evidence Graph
Claim extraction, evidence matching, citation validation, answerability, evidence graph.
Guardrail: unsupported claims cannot be marked verified.

## Phase 11 — Contradiction Detection
Detect conflicting numbers, dates, statements, units, and versions.
Guardrail: never silently choose a conflicting source.

## Phase 12 — Calculation Agent
Safe Python operations: arithmetic, percentage change, average, ratio, growth.
Guardrail: LLM extracts; Python calculates; LLM explains.

## Phase 13 — Document Comparison
Version/section/value/table comparison with source links.

## Phase 14 — RAG Evaluation
Recall, Precision@K, MRR, context relevance, citation coverage, faithfulness, contradiction rate, answerability, latency, tool success.
Guardrail: no fabricated metrics.

## Phase 15 — Security + Hardening
Test prompt injection, secret leakage, scope isolation, unauthorized tools, malformed files, citation hallucination, unsupported questions, contradictions, and calculations.

## Phase 16 — FastAPI
Expose collection, upload, query, document, evidence, and evaluation endpoints.

## Phase 17 — Next.js
Production frontend; preserve all backend guardrails.

## Phase 18 — Flagship Demo
Use every file in `test_doc/`—two PDFs, two CSV tables, and six JPG images—to
demonstrate routing, retrieval, local OCR, NVIDIA vision, reranking, evidence
fusion, citations, scope filtering, and final claim verification. A TXT fixture
is used separately because the supplied directory contains no TXT file.

## Phase 19 — Evidence-grounded Learning Workspace
Implemented and verified as a focused extension of the existing Next.js,
FastAPI, retrieval, NVIDIA reasoning, guardrail, and SQLite layers:

- Topic Tree and hierarchical summaries with bounded staged section batches
- Cheat Sheet formats with source-linked sections and print/export support
- Flashcards with reveal/rating session flow and count/deduplication limits
- Quiz generation with hidden keys, strict option validation, deterministic scoring, and review
- Teach Me beginner/intermediate/advanced lessons with source-linked checks
- Knowledge Graph nodes/edges with explicit/inferred labels, validation, and graph fallback list
- Learning artifact persistence with source-version invalidation and scope isolation
- Learning UI loading, empty, failure/retry, stale-source, and insufficient-evidence states

Automated verification: `PYTHONPATH=backend .venv/bin/python -m pytest -q`
(38 passed), frontend `npm run lint` and `npm run build` pass. Live NVIDIA
generation remains configuration-dependent and is covered by clear API 503
handling when the provider is unavailable.

Integrated smoke matrix (9 Oct 2026): API `/health` and production Next.js
page returned 200; a real README upload parsed successfully; processing and
the core supported/unsupported query flows passed using scoped keyword fallback;
out-of-scope requests returned 400; Knowledge Graph, Topic Tree, Flashcards,
Quiz generation/submission, Cheat Sheet, and Teach Me beginner/intermediate/
advanced flows passed through the real FastAPI routes with configured NVIDIA
reasoning; a multi-document Topic Tree and Cheat Sheet passed with both source
documents inside the selected scope; provider/health responses contained no
secret values. Qdrant was not running in the environment, so the automatic
upload indexing step reported its documented Qdrant error and the collection
did not reach `ready`; live vector indexing and Docker/Qdrant regression were
blocked, not claimed as passed. A later multi-document graph retry received a
transient NVIDIA 502; the earlier graph smoke passed and the route surfaced the
provider failure without saving invalid content.

## Release Checklist
- [x] Multi-document upload
- [x] Mixed-format ingestion
- [x] OCR/tables/images
- [x] Embeddings/Qdrant
- [x] Hybrid retrieval/reranking
- [x] Agent router/tool allowlist
- [x] Scope filtering
- [x] Cross-document reasoning
- [x] Evidence fusion
- [x] Citation validation
- [x] Answerability/abstention
- [x] Prompt-injection defense
- [x] Contradiction detection
- [x] Deterministic calculations
- [x] Evidence graph
- [x] Final verification
- [x] RAG evaluation
- [x] Security tests
- [x] Learning Workspace routes, artifact validation, and integrated Next.js UI
- [x] UX polish, state persistence, OCR stability, and retrieval optimizations
