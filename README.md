# DocuNova

DocuNova is an evidence-first, multimodal document intelligence platform. It
will ingest and search mixed-format document collections, reason across
documents, expose source evidence, detect contradictions, perform deterministic
calculations, and verify claims before displaying an answer.

## Current status

Phase 0 through Phase 19 are implemented:

- Python backend package layout for `backend/app`, `backend/api`, `backend/core`, and storage directories
- Environment-backed NVIDIA NIM and Qdrant configuration
- Secret-safe FastAPI health endpoint
- Streamlit setup screen
- Isolated filesystem storage paths
- `.env.example` and dependency manifest
- SQLite collection and document metadata
- Secure multi-file upload validation for PDF, DOCX, TXT, Markdown, CSV, PNG, JPG, and JPEG
- Collection and document upload/list API endpoints
- Original files stored under generated IDs rather than user-controlled paths
- PDF, DOCX, TXT, Markdown, CSV, and image parsing into typed evidence records
- Deterministic source-preserving chunking
- SQLite evidence persistence with document processing status
- NVIDIA embedding integration with lazy secret/configuration checks
- Qdrant vector indexing with complete evidence payload metadata
- Scope-filtered vector retrieval for single- and multi-document questions
- Grounded NVIDIA reasoning with citation validation and safe abstention
- Hybrid BM25/keyword plus vector retrieval and score-preserving reranking
- Local Tesseract 5 OCR, NVIDIA vision, and NVIDIA reranking boundaries with deterministic fallbacks
- Explicit agent router and tool allowlist
- Evidence fusion, claim verification, evidence graph, and contradiction reporting
- Deterministic calculations for arithmetic, averages, ratios, and growth
- Source-linked document comparison and measured evaluation metrics
- Prompt-injection and secret-pattern regression checks
- Next.js evidence workspace under `frontend/`
- Evidence-grounded Learning Workspace: Knowledge Graph, Topic Tree, Flashcards,
  Quiz, Cheat Sheet, and Teach Me Mode
- State persistence across feature tabs and local chat history session management
- 3D flip-card animations and batch processing distributions for Flashcards
- Strict learning schemas, independent source verification, deterministic quiz
  scoring, SQLite artifact persistence, scope isolation, and stale-source invalidation
- Automatic upload → processing → indexing workflow with durable status
- Logfire request, service, guardrail, and lifecycle instrumentation

External services remain optional during local development and are activated only
when their operator configuration is provided.

## Setup

```bash
uv sync --locked
source .venv/bin/activate
cp .env.example .env

cd frontend
npm install
cd ..
```

Set `NVIDIA_API_KEY` in `.env` before using reasoning, embedding, or Vision operations.
Set the separate `NVIDIA_RERANKER_API_KEY` value before using the reranker.
OCR runs locally through Tesseract 5; Vision uses the global `NVIDIA_API_KEY`. Never
commit `.env` or place secrets in documents, logs, source code, or tests.

Install the native Tesseract 5 executable and English language data before OCR
operations. See the [official Tesseract repository](https://github.com/tesseract-ocr/tesseract)
for platform-specific installation guidance. On Debian/Ubuntu:

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-eng
tesseract --version
```

The default optional NVIDIA model configuration is:

```env
NVIDIA_EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b
NVIDIA_REASONING_FALLBACK_MODEL=nvidia/nemotron-3-super-120b-a12b
NVIDIA_RERANKER_MODEL=nvidia/llama-nemotron-rerank-vl-1b-v2
NVIDIA_RERANKER_URL=https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking
TESSERACT_CMD=tesseract
TESSERACT_LANG=eng
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
NVIDIA_VISION_FALLBACK_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_VISION_TIMEOUT_SECONDS=30
NVIDIA_VISION_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

DocuzRAG invokes the locally installed Tesseract 5 executable for scanned pages
and text-bearing images. It stores the result as typed `OCR` evidence while
preserving the original image or PDF page reference. Vision uses the configured
NVIDIA VLM only for typed visual inference; it does not replace direct source
text or OCR. Reranking and vision remain optional until valid credentials are
configured.

Vision first tries the configured 90B model and falls back to the configured
11B model after a bounded timeout or retryable provider failure. Reasoning
similarly falls back from the configured 550B model to the configured 120B
model. Both fallbacks use the same NVIDIA API key and emit only safe provider
status telemetry.

### NVIDIA provider credentials

Reasoning, embedding, and Vision use `NVIDIA_API_KEY`. OCR is local. The reranker uses
a separate credential because it may not be authorized by the global key:

```env
NVIDIA_RERANKER_API_KEY=your-reranker-key
```

Provider status is exposed as configured/not-configured only; key values never
reach the frontend, logs, or API responses.

### NVIDIA API key

Create or retrieve the key from the NVIDIA Developer portal, then edit the
private `.env` file locally:

```env
NVIDIA_API_KEY=your-key-value
```

Do not paste the key into chat, source files, logs, or committed configuration.
The application checks for the key only when an NVIDIA-backed operation starts.

### Qdrant

The default configuration uses:

```env
QDRANT_URL=http://localhost:6335
```

With Docker Desktop running, start the dedicated DocuzRAG Qdrant service from
the project root:

```bash
docker compose up -d qdrant
```

Verify it is available:

```bash
curl http://localhost:6335/healthz
```

The dedicated service is named `docuzrag-qdrant`, maps host ports 6335/6336 to
Qdrant’s internal 6333/6334 ports, and persists data in the named Docker volume
`docuzrag_qdrant_data`. The existing `docurag-final` instance remains on its
own port and storage and is not used by DocuzRAG.

For Qdrant Cloud, replace `QDRANT_URL` with the cluster URL and set
`QDRANT_API_KEY` in the private `.env` file.

## Run the services

Start the API:

```bash
source .venv/bin/activate
PYTHONPATH=backend uvicorn api.fastapi_app:app --reload
```

The non-sensitive health check is available at
`http://127.0.0.1:8000/health`.

Current API routes include:

- `POST /collections`
- `GET /collections`
- `POST /collections/{collection_id}/documents`
- `GET /collections/{collection_id}/documents`
- `POST /collections/{collection_id}/documents/{document_id}/process`
- `GET /collections/{collection_id}/documents/{document_id}/evidence`
- `POST /collections/{collection_id}/index`
- `POST /collections/{collection_id}/documents/{document_id}/index`
- `POST /collections/{collection_id}/query`
- `POST /calculate`
- `POST /collections/{collection_id}/compare`
- `GET /collections/{collection_id}/contradictions`
- `POST /evaluation`
- `GET /evaluations`
- `POST /learning/knowledge-graph`
- `GET /learning/knowledge-graph/{collection_id}`
- `POST /learning/flashcards/generate` and `GET /learning/flashcards/{deck_id}`
- `POST /learning/quizzes/generate`
- `POST /learning/quizzes/{quiz_id}/submit`
- `POST /learning/topic-tree`
- `POST /learning/cheat-sheet`
- `POST /learning/teach`
- `POST /learning/teach/{session_id}/answer`
- `GET /learning/artifacts/{collection_id}`

Start the initial UI in a second terminal:

```bash
source .venv/bin/activate
PYTHONPATH=backend streamlit run backend/app/streamlit_app.py
```

Qdrant is expected at the configured `QDRANT_URL` (by default,
`http://localhost:6335`). Phase 3 indexes textual evidence with the configured
NVIDIA embedding model and preserves source metadata in Qdrant payloads. Later
retrieval phases add hybrid search, reranking, verification, and abstention when
evidence is missing or unverifiable.

The default upload limit is 50 MiB so the bundled 39 MiB movie-credit CSV can be
used in the acceptance workflow. Lower it through `MAX_UPLOAD_SIZE_BYTES` when
the deployment requires a smaller limit.

The API-backed Next.js workspace can be started separately:

```bash
cd frontend
cp .env.example .env.local
npm run dev
```

The frontend receives document metadata, evidence, and answers from FastAPI; it
does not receive NVIDIA or Qdrant secrets.

After a collection is ready, the Learning Workspace appears below the grounded
query. It reuses the collection's document checkboxes as scope. Generation
requires configured NVIDIA reasoning access; missing credentials produce a
scoped provider error rather than ungrounded fallback content. Quiz keys are
never sent to the browser before submission. Flashcard ratings and lesson
progress are session-local until a future authenticated user/session boundary
is added.

If Qdrant is unavailable, upload parsing still records source evidence but the
automatic job remains not ready and reports a Qdrant-specific error. Hybrid
retrieval can use its existing keyword fallback for local smoke testing; start
the documented Qdrant service for the full vector-indexed workflow.

Uploading through the frontend automatically starts processing and indexing.
The workspace is frozen while the `/ingestion` status reports `processing` or
`indexing`, and becomes queryable only after the backend reports `ready`.

### Pydantic Logfire

The backend instruments FastAPI requests and emits lifecycle events for upload,
processing, indexing, retrieval, LLM synthesis, guardrails, provider status, and
final response status. Set `LOGFIRE_TOKEN` in the private environment to enable
export. The Logfire MCP configuration uses `LOGFIRE_MCP_TOKEN` through
`opencode.json`; the credential is intentionally not stored in the repository.

The browser-dependent Logfire authentication step must be completed manually by
the operator; see the final setup commands below.

To run the offline flagship flow without Docker, Qdrant, or NVIDIA access:

```bash
PYTHONPATH=backend .venv/bin/python scripts/flagship_demo.py
```

For local keyword-only retrieval while external embedding/Qdrant services are
being configured, set this private environment value:

```env
RETRIEVAL_MODE=keyword
```

The normal production setting is `RETRIEVAL_MODE=hybrid`.

Learning limits can be tuned in the private environment using
`LEARNING_MAX_CARDS`, `LEARNING_MAX_QUESTIONS`, `LEARNING_MAX_NODES`,
`LEARNING_MAX_EDGES`, `LEARNING_CONTEXT_CHARS`, and `LEARNING_OUTPUT_CHARS`.
The defaults are conservative and prevent oversized model requests. Learning
generation uses the same `NVIDIA_API_KEY` reasoning provider and does not add a
second model provider or a graph database.

### Operator-only Logfire authentication

Run these commands manually in the project directory. `uv run logfire auth`
opens a browser and cannot be completed by the application setup:

```bash
uv add 'logfire[system-metrics]'
uv run logfire auth
uv run logfire projects use --org 'coolayush4015' 'docuz-rag'
```

Then export the private Logfire write token as `LOGFIRE_TOKEN` and the private
MCP token as `LOGFIRE_MCP_TOKEN` before starting the backend or opencode.

### Indexing troubleshooting

The indexing workflow is:

```text
Upload → Process → Qdrant health check → NVIDIA embedding → Qdrant index → Query
```

After changing any NVIDIA provider key, restart FastAPI and Streamlit. The API loads
configuration once per process. A missing or invalid key now reports the
provider HTTP status/message with credentials redacted. A stopped Qdrant
service reports a Qdrant-specific error before embedding work starts.

### Verification commands

Run the offline backend regression and learning-validation suite:

```bash
PYTHONPATH=backend .venv/bin/python -m pytest -q
```

Run the Next.js type check and production build:

```bash
cd frontend
npm run lint
npm run build
```

## Design constraints

The implementation follows `rules.md`:

- Evidence must support factual claims.
- Queries receive an explicit answerability status.
- Uploaded documents are untrusted data and cannot override application rules.
- Retrieval must enforce collection and selected-document scope.
- Citations must come from actual evidence metadata.
- Contradictions must be surfaced.
- Important calculations must run through deterministic Python tools.
- Agents can use only the explicit tool allowlist.
- Missing NVIDIA configuration stops only dependent operations.
