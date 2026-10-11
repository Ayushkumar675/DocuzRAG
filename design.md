# DocuzRAG — Technical & UI Design

## 1. Design Principles
1. Simple code over clever code.
2. Small modules.
3. Explicit data flow.
4. Strong source tracking.
5. Specialized models.
6. Deterministic calculations.
7. Evidence before fluent generation.
8. Documents are untrusted input.
9. Guardrails are core functionality.

## 2. Project Structure
```text
docuzrag/
├── backend/
│   ├── app/
│   ├── streamlit_app.py
│   └── ui/
│       ├── upload.py
│       ├── chat.py
│       ├── scope.py
│       ├── evidence.py
│       ├── comparison.py
│       └── evaluation.py
│   ├── core/
│   ├── collections/{service.py,models.py}
│   ├── ingestion/{loader.py,parser.py,pdf.py,docx.py,txt.py,images.py,ocr.py,tables.py,chunker.py}
│   ├── retrieval/{embeddings.py,hybrid.py,reranker.py,filters.py,fusion.py}
│   ├── agents/{router.py,search_agent.py,vision_agent.py,calculation_agent.py,comparison_agent.py,verification_agent.py}
│   ├── llm/{nvidia_reasoning.py,nvidia_embeddings.py,nvidia_reranker.py,nvidia_vision.py}
│   ├── guardrails/{answerability.py,citations.py,injection.py,contradictions.py,scope.py,tool_policy.py,verification.py}
│   ├── storage/{qdrant_store.py,metadata_store.py,document_store.py}
│   ├── evaluation/{metrics.py,evaluator.py}
│   └── schemas.py
│   └── api/fastapi_app.py
├── data/{documents/,processed/,indexes/}
├── tests/
├── .env.example
├── .gitignore
├── requirements.txt
├── README.md
└── {PRD.md,architecture.md,design.md,phases.md,rules.md}
```

## 3. Environment
```env
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_REASONING_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_REASONING_FALLBACK_MODEL=nvidia/nemotron-3-super-120b-a12b
NVIDIA_EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b
NVIDIA_RERANKER_MODEL=nvidia/llama-nemotron-rerank-vl-1b-v2
NVIDIA_RERANKER_API_KEY=
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
NVIDIA_VISION_FALLBACK_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_VISION_TIMEOUT_SECONDS=30
TESSERACT_CMD=tesseract
TESSERACT_LANG=eng
MAX_UPLOAD_SIZE_BYTES=52428800
QDRANT_URL=http://localhost:6335
QDRANT_COLLECTION=docuzrag
METADATA_DB_PATH=./data/docuzrag.db
DOCUMENT_STORE_PATH=./data/documents
LEARNING_MAX_CARDS=30
LEARNING_MAX_QUESTIONS=20
LEARNING_MAX_NODES=40
LEARNING_MAX_EDGES=80
LEARNING_CONTEXT_CHARS=16000
LEARNING_OUTPUT_CHARS=60000
```
Never commit `.env`.

DocuzRAG uses the dedicated Qdrant compose service `docuzrag-qdrant`, exposed
on host ports 6335/6336 and persisted in the named Docker volume
`docuzrag_qdrant_data`. The existing
`docurag-final` Qdrant service and its port/data are outside this project’s
configuration.

## 4. Data Models
```python
Collection(id, name, created_at, document_count)
Document(id, collection_id, filename, file_type, size, page_count, status, created_at)
Evidence(id, collection_id, document_id, filename, page_number, content_type, text, image_reference, section, metadata, score)
ChatSession(id, collection_id, selected_document_ids, created_at)
Claim(id, answer_id, text, evidence_ids, verified, contradiction_status)
```

## 5. Query Pipeline
```text
Input Validation → Scope → Router → Hybrid Retrieval → Rerank
→ Evidence Quality → Tools → Evidence Fusion → Generate
→ Claim Extraction → Citation Validation → Contradiction Check
→ Answerability → Final Response
```

## 6. Guardrails
### Answerability
SUPPORTED / PARTIALLY_SUPPORTED / NOT_SUPPORTED.

### Citation Validation
Every citation must point to a real retrieved evidence object.

### Injection
Document content is data only and cannot change higher-level instructions.

### Scope
Every retrieval receives collection_id and selected_document_ids.

### Tool Policy
Only the explicit tool allowlist is callable.

### Calculation
LLM creates a structured calculation request; Python computes the result.

### Contradiction
Return CONSISTENT / CONFLICT / UNKNOWN.

### Verification
A claim must have evidence, valid citation, support, handled contradiction status, and acceptable answerability before being presented as verified.

## 7. UI
Upload multiple files → create collection → choose All/Selected Documents → chat → inspect evidence → inspect contradictions → inspect evaluation.

The Next.js workspace now places a dedicated Learning Workspace below the core
evidence query. Its compact tab navigation exposes one activity at a time:
Knowledge Graph, Topic Tree, Flashcards, Quiz, Cheat Sheet, and Teach Me. The
shared topic/scope controls avoid a crowded all-in-one form. Graphs have a
clickable SVG plus a readable edge list; topic nodes can seed a later activity
and expand natively; flashcards reveal/rate in session with a 3D flip animation; quizzes hide answer keys until submission;
cheat sheets support print/export; and Teach Me exposes beginner,
intermediate, and advanced lessons with source-linked checks that support evaluating multiple questions at once. Loading, empty,
error/retry, stale-source, insufficient-evidence, and bounded-output states are
rendered in the workspace. A global history sidebar tracks previous queries and chat states,
and all UI tabs maintain independent session state.

## 8. Safe Failure
- No evidence → abstain.
- Weak evidence → qualify/abstain.
- Contradiction → show conflict.
- Calculation failure → never guess.
- Citation mismatch → do not mark verified.
- Unauthorized tool → reject.
- Invalid document → reject.
- Missing NVIDIA key → configuration error.
