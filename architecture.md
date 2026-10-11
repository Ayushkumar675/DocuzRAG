# DocuzRAG — Architecture

## 1. Principles
- Evidence before generation.
- Documents are untrusted data.
- Specialized models perform specialized tasks.
- Scope is enforced before retrieval.
- Calculations are deterministic.
- Claims map to evidence.
- Unsupported questions are rejected or qualified.
- Tools use an explicit allowlist.
- Core services are frontend-independent.

## 2. High-Level Architecture
```text
USER
 ↓
STREAMLIT
 ↓
FASTAPI
 ↓
Query / Collection Service
 ↓
Scope + Input Validation
 ↓
Agent Router
 ↓
Hybrid Retrieval
 ├─ Vector Search
 └─ BM25/Keyword
 ↓
Fusion + Reranking
 ↓
Evidence Quality Check
 ↓
Specialized Tools
 ├─ Search
 ├─ Vision
 ├─ Calculation
 └─ Comparison
 ↓
Evidence Fusion
 ↓
NVIDIA Reasoning Model
 ↓
Claim Verification
 ├─ Citation Validation
 ├─ Contradiction Check
 └─ Answerability Check
 ↓
GROUNDED RESPONSE
```

## 3. Ingestion
```text
Files → Validation → Format Detection → Parser/Tesseract 5 OCR/Vision
→ Text/Tables/Images → Chunking → Evidence Records → Embeddings → Qdrant
```

Every evidence item retains collection ID, document ID, filename, page/reference, content type, source reference, and score.

CSV evidence retains row ranges and repeats column headers in each searchable
chunk. Direct image evidence remains separate from local `OCR` text and optional
NVIDIA `VISION` inference. OCR requires a local Tesseract 5 installation and no
NVIDIA credential. Embeddings, reasoning, and vision share `NVIDIA_API_KEY`;
the reranker uses only `NVIDIA_RERANKER_API_KEY`. Reasoning and vision use
bounded smaller-model fallbacks after retryable provider failures; fallback use
is logged without document content or credentials.

## 4. Agent Tools
Allowed:
```text
retrieve_documents
search_metadata
analyze_image
compare_documents
calculate
verify_claim
```
No unrestricted shell, Python, filesystem, internet, or email.

## 5. Guardrail Pipeline
```text
Query → Scope Filter → Retrieval → Rerank → Evidence Quality
→ Generate → Extract Claims → Match Evidence → Validate Citations
→ Check Contradictions → Check Answerability → Display
```

## 6. Prompt Injection
```text
Document → UNTRUSTED DATA → Parser/OCR/Vision → Evidence
```
Document content cannot override system/application/tool rules.

## 7. Evidence Graph
```text
Claim → Evidence ID → Document ID → Page/Image/Table
```

## 8. Contradiction Detection
```text
Evidence A + Evidence B → Contradiction Detector
→ CONSISTENT / CONFLICT / UNKNOWN
```
Conflicts must be surfaced, never silently resolved.

## 9. Calculation
```text
Question → LLM extracts inputs → Structured request → Safe Python
→ Result → LLM explanation
```

## 10. Storage
Qdrant: vectors + retrieval metadata. DocuzRAG connects to its dedicated
`docuzrag-qdrant` instance on host port 6335, persisted in the named Docker
volume `docuzrag_qdrant_data`; it does not use the separate `docurag-final`
instance.
SQLite: collections, documents, sessions, evaluation records.
Filesystem: original/processed documents.

## 11. Future Frontend
```text
Next.js → FastAPI → Core
```
Core services must not depend on Streamlit.

## 12. Learning Workspace (implemented)
```text
Next.js Learning Workspace
  ↓ collection + selected-document scope
FastAPI /learning routes
  ↓ validate scope + ingestion readiness
LearningService
  ↓ existing hybrid retrieval / reranking / evidence context
NVIDIA reasoning structured generation
  ↓ Pydantic strict schema + citation/evidence validation
independent evidence review + deterministic quiz scoring
  ↓ source version fingerprint
SQLite learning_artifacts (payload + stable evidence IDs)
```

Learning artifacts do not copy original document files. Every generated node,
edge, card, question, outline node, sheet section, lesson section, and tutor
check carries permitted evidence IDs. Knowledge-graph edges are explicitly
marked `explicit` or `inferred`; graph size, quiz/card counts, context, and
output are bounded by environment-backed limits. Artifact reads reject stale
source/index versions and scopes that do not include the artifact's sources.

Implemented routes are `POST /learning/knowledge-graph`, `GET
/learning/knowledge-graph/{collection_id}`, `POST
/learning/flashcards/generate`, `GET /learning/flashcards/{deck_id}`, `POST
/learning/quizzes/generate`, `POST /learning/quizzes/{quiz_id}/submit`, `POST
/learning/topic-tree`, `POST /learning/cheat-sheet`, `POST /learning/teach`,
`POST /learning/teach/{session_id}/answer`, and `GET
/learning/artifacts/{collection_id}`. Route bodies accept `collection_id` so the
same contracts work with the existing path/query conventions.

Frontend tracks per-tab state independently (e.g. tracking quiz/teach scores and active artifacts across tabs) and persists global chat history through `localStorage`, removing the need for a separate user-identity session backend while avoiding state loss on refresh.
