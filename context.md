# DocuzRAG Project Context

This file records the work completed so far, the fixes applied during debugging,
the current project state, verification results, and remaining operational steps.

## Project purpose

DocuzRAG is an evidence-first multimodal document intelligence application. It
uploads documents into collections, extracts source-preserving evidence, indexes
text for retrieval, answers questions using grounded context, validates
citations, surfaces contradictions, and exposes the evidence used for each
answer.

The project follows the mandatory rules in `rules.md`:

- Uploaded documents are untrusted data.
- Document text must never override application instructions.
- Retrieval must enforce collection and selected-document scope.
- Claims require supporting evidence.
- Citations must reference actual retrieved evidence.
- Contradictions must be surfaced rather than silently resolved.
- Important calculations must use deterministic Python tools.
- Missing provider configuration must not expose secrets or break application startup.

## Work completed

### Application foundation

- Created the Python package structure under `backend/app`, `backend/api`, `backend/core`, storage, and tests.
- Added environment-backed configuration through `backend/core/config.py`.
- Added safe FastAPI health handling.
- Added isolated filesystem storage for original uploads and processed data.
- Added SQLite metadata storage for collections, documents, evidence, and evaluations.
- Added secure multi-file upload validation.
- Supported PDF, DOCX, TXT, Markdown, PNG, JPG, and JPEG uploads.
- Stored uploaded files under generated IDs rather than user-controlled paths.

### Ingestion and evidence

- Added PDF text extraction using PyMuPDF.
- Added DOCX extraction using `python-docx`.
- Added TXT and Markdown extraction.
- Added image preservation as typed `IMAGE` evidence.
- Added PDF table extraction and typed `TABLE` evidence.
- Added deterministic source-preserving chunking.
- Preserved document ID, collection ID, filename, page number, source reference,
  content type, image reference, section, and metadata on evidence records.
- Added document processing statuses: uploaded, processing, processed, and error.

### NVIDIA integrations

The integrations are lazy and configuration-backed. They do not initialize
provider clients until the related operation is requested.

#### Embeddings

- Added NVIDIA OpenAI-compatible embedding support.
- Default embedding model:

  ```text
  nvidia/nemotron-3-embed-1b
  ```

- Added vector-order and vector-dimension validation.
- Added safe provider error handling with credential redaction.
- Added Qdrant health checks before embedding work.

#### Reasoning

- Added NVIDIA OpenAI-compatible reasoning support.
- Added a grounding system prompt.
- Added instructions for exact evidence citation format:

  ```text
  [evidence:EVIDENCE_ID]
  ```

- Added provider status reporting without exposing API keys.

#### Reranking

- Added an optional NVIDIA HTTP reranker client.
- Uses the official query/passages request shape.
- Parses NVIDIA `rankings[].logit` responses.
- Restores returned rankings to the original passage order.
- Added a deterministic lexical reranker fallback.
- Added runtime fallback when NVIDIA reranking is unavailable.
- Current documented model example:

  ```text
  nvidia/llama-nemotron-rerank-vl-1b-v2
  ```

#### OCR

- Added local Tesseract 5 OCR for images and rendered scanned-document pages.
- Uses the configured local executable (`TESSERACT_CMD`, default `tesseract`)
  and language (`TESSERACT_LANG`, default `eng`).
- Validates that the executable is Tesseract major version 5 or newer.
- Stores OCR results as typed `OCR` evidence while preserving the original
  image or page reference.

#### CSV tables

- Added strict UTF-8, header, and row-width validation for CSV uploads.
- Added compact searchable table evidence with repeated headers and row ranges
  in source references.
- Preserved the original CSV as the authoritative full-fidelity source.
- Compacted nested TMDB cast/crew JSON into searchable names and roles without
  embedding the entire 39 MB source payload.

#### Vision

- Added an optional NVIDIA vision client for image/chart analysis.
- Uses the configured OpenAI-compatible vision endpoint.
- Primary model:

  ```text
  meta/llama-3.2-90b-vision-instruct
  ```

- Sends image data as base64 image data URLs.
- Preserves visual output as typed `VISION` inference evidence.
- Keeps vision output separate from direct source text.
- Diagnosed repeated 90B vision timeouts through Logfire MCP records.
- Added a bounded 30-second primary request and fallback to
  `meta/llama-3.2-11b-vision-instruct` using the same NVIDIA key.
- Image ingestion retries processed image documents that lack `VISION` evidence
  after an earlier provider timeout.

#### Reasoning fallback

- Retained `nvidia/nemotron-3-ultra-550b-a55b` as the primary model.
- Added retryable-provider handling and fallback to
  `nvidia/nemotron-3-super-120b-a12b`.

### Retrieval and indexing

- Added Qdrant vector indexing with complete evidence payload metadata.
- Added collection and selected-document scope filtering.
- Added hybrid vector plus BM25 retrieval.
- Added keyword-only retrieval mode.
- Added filename and page metadata to searchable text so document-title queries
  can find relevant source pages generically.
- Added a local keyword fallback when NVIDIA embeddings or Qdrant are unavailable.
- Preserved vector score, keyword score, fusion score, and rerank score.
- Added source-preserving evidence fusion.
- Added explicit selected-document diversity in vector, hybrid, keyword-only,
  and embedding-failure fallback retrieval paths.
- Added compact row-sized CSV groups so exact IDs and table headers remain
  retrievable.
- Added lexical claim-support checks so a valid-looking citation ID cannot verify
  unrelated generated text.
- Treated uncited Markdown introduction labels ending in `:` as structure while
  keeping factual bullets and sentences citation-required.

### Grounding and verification

- Added answerability states:

  ```text
  SUPPORTED
  PARTIALLY_SUPPORTED
  NOT_SUPPORTED
  ```

- Added citation extraction and validation against the current retrieved evidence.
- Added claim extraction and evidence graph construction.
- Added contradiction detection for comparable numeric statements.
- Added answer retry when the first model response fails verification.
- Retry prompts now include the actual verification feedback.
- Added a citation ledger containing only evidence included in the bounded model
  context.
- Added verification handling for Markdown headings, numbered lists, bullet
  lists, SQL/code fences, and citations placed on separate lines.
- Prevented formatting tokens such as `1.`, headings, and closing code fences
  from being incorrectly treated as uncited factual claims.
- Added source-bound excerpt output when a verified synthesis is unavailable.
- The fallback output includes actual source filenames, pages, evidence IDs, and
  citations instead of silently hiding retrieved evidence.
- Added `verification_issues` to the API response so the frontend can explain
  why an answer was downgraded.

### Agent and tool safety

- Added explicit agent routing.
- Added an allowlist for calculation and supported tools.
- Rejected arbitrary tool names.
- Added deterministic calculations for percentages, averages, ratios, growth, and
  other supported operations.
- Added prompt-injection detection for uploaded content.
- Added secret-pattern detection that reports only pattern status.
- Added document comparison and evaluation metrics.

### User interfaces

- Added the Streamlit application workflow.
- Added the Next.js evidence workspace under `frontend/`.
- Implemented the visible workflow:

  ```text
  Upload → Process → Index → Query
  ```

- Added collection creation and selection.
- Added document selection for scoped questions.
- Added readiness indicators for processing and indexing.
- Added answerability and verification status display.
- Added evidence trace display with source references and scores.
- Added contradiction notices.
- Added verification diagnostics to the answer panel.

## Debugging completed for the evidence workspace

The provided screenshot showed:

- All selected documents processed.
- The collection indexed successfully.
- Evidence returned from retrieval.
- The answer displayed:

  ```text
  I could not verify a grounded answer from the retrieved evidence.
  ```

The issue was not that the uploaded documents were missing. The failure was in
the final verification stage. The verifier treated normal answer formatting as
uncited claims and rejected otherwise usable responses.

The fix is generic and does not refer to any document name, collection name,
assignment, or user question.

## Dedicated DocuzRAG Qdrant instance

- Created `docuzrag-qdrant` from `qdrant/qdrant:v1.12.5`.
- Dedicated host ports are 6335 (HTTP) and 6336 (gRPC).
- Dedicated persistent volume: `docuzrag_qdrant_data`.
- DocuzRAG now defaults to `http://localhost:6335` and the `docuzrag`
  collection.
- The existing `docurag-final-qdrant-1` container remains on its own port and
  volume; it was not used or modified by current DocuzRAG operations.
- Verified the dedicated collection persists across a container restart.

## Current provider and observability status

- The private environment uses one global NVIDIA key for embeddings, reasoning,
  and vision, plus a separate reranker key. Secret values are not printed or
  committed.
- Live embeddings, reranking, reasoning fallback, and vision fallback requests
  were exercised successfully.
- The updated Logfire MCP token authenticates against the `docuz-rag` project.
  Read-only `tools/list` and `query_run` calls were used to inspect vision
  timeout spans and verify fallback events.
- Logfire showed the primary 90B vision requests timing out at the former
  180-second limit. The repaired client now uses a bounded timeout and a smaller
  vision fallback instead of blocking image ingestion indefinitely.

## Verification performed

The current implementation has passed:

- 34 Python tests.
- Python compilation for `backend`, `tests`, and `scripts`.
- Frontend TypeScript validation.
- Next.js production build.
- `uv pip check`.
- Offline flagship demo.
- Dedicated Qdrant health, collection, persistence, and separation checks.
- FastAPI health, provider settings, upload, automatic processing/indexing, and
  query checks against dedicated Qdrant.
- Individual and multi-document acceptance questions across all ten files in
  `test_doc`, including factual, descriptive, analytical, comparative,
  multi-part, cross-document, and unsupported questions.

The final acceptance collection contains ten processed demo documents, 2,556
SQLite evidence records, and 2,550 searchable Qdrant vectors; six direct image
records are intentionally not vectorized without text. The durable ingestion
status is `ready`.

## Important files

- `rules.md` — mandatory grounding and safety rules.
- `.env.example` — safe configuration template.
- `.env` — private local configuration; do not commit.
- `backend/core/config.py` — environment-backed runtime configuration.
- `backend/core/ingestion/` — document parsing, OCR, chunking, and processing.
- `backend/core/llm/` — NVIDIA embeddings, reasoning, OCR, reranking, and vision clients.
- `backend/core/retrieval/` — indexing, hybrid retrieval, reranking, context, and answers.
- `backend/core/guardrails/` — scope, citations, verification, contradictions, injection,
  secrets, and answerability.
- `backend/api/fastapi_app.py` — API routes and response mapping.
- `backend/app/streamlit_app.py` — Streamlit workflow.
- `frontend/` — Next.js evidence workspace.
- `docker-compose.yml` — dedicated `docuzrag-qdrant` deployment on ports 6335/6336.
- `scripts/manage_dedicated_qdrant.py` — Docker Engine API create/start/check helper.
- `scripts/resume_demo_index.py` — durable processing/indexing resume helper.
- `scripts/verified_question_ledger.py` — repeatable grounded acceptance ledger.
- `tests/` — provider, retrieval, citation, scope, guardrail, and regression tests.

## Latest update — Evidence-grounded Learning Workspace

The application was extended without replacing the existing collection,
ingestion, retrieval, evidence, guardrail, NVIDIA, Qdrant, SQLite, or frontend
architecture. The existing Next.js workspace now contains a focused Learning
Workspace below the core grounded-query flow. It uses the same collection and
selected-document scope controls instead of introducing a second RAG pipeline.

### Learning features implemented

#### Knowledge Graph

- Added `POST /learning/knowledge-graph` and
  `GET /learning/knowledge-graph/{collection_id}`.
- Generates source-grounded concepts and relationships through the existing
  scoped retriever and NVIDIA reasoning client.
- Every node and edge carries valid evidence IDs from the permitted scope.
- Relationships are labelled `explicit` or `inferred`; inferred relationships
  are not presented as direct quotations.
- Validates duplicate concepts, missing nodes, invalid edges, self-edges,
  graph-size limits, stale evidence, and out-of-scope references.
- Frontend includes a bounded SVG visualization, clickable node details, source
  links, and a readable relationship-list fallback for larger graphs.

#### Topic Tree and hierarchical summaries

- Added `POST /learning/topic-tree`.
- Uses bounded staged section/document batches for longer source collections.
- Preserves original section headings where available and marks generated
  organization as inferred.
- Validates parent references, duplicate sibling topics, depth, cycles, missing
  evidence, and source-version changes.
- Frontend supports expand/collapse and selecting a topic for later flashcards,
  quizzes, cheat sheets, or lessons.

#### Flashcards

- Added `POST /learning/flashcards/generate` and
  `GET /learning/flashcards/{deck_id}`.
- Supports topic, difficulty, document scope, and card-count controls.
- Cards include questions, answers, explanations, difficulty, and evidence IDs.
- Duplicate questions and unsupported content are rejected before display.
- Frontend supports reveal-answer study flow and session-local Again, Hard,
  Good, and Easy ratings.
- Ratings and learning progress remain session-local because the application has
  no authenticated user/session identity boundary yet.

#### Quiz Generator

- Added `POST /learning/quizzes/generate` and
  `POST /learning/quizzes/{quiz_id}/submit`.
- Supports single-choice and true/false questions.
- Strict schemas reject malformed questions, duplicate options, invalid keys,
  unsupported citations, ambiguous questions, and unsupported distractors.
- Quiz answer keys are removed from the pre-submission API response.
- Every answer option is independently reviewed against the cited evidence.
- Final scoring is deterministic Python logic, never an LLM decision.
- Frontend provides answer selection, submission, score, explanations, and
  source review.

#### Cheat Sheet

- Added `POST /learning/cheat-sheet`.
- Supports quick revision notes, key concepts, formula sheets, comparison
  tables, exam revision outlines, and last-minute revision notes.
- Sections preserve evidence IDs and are checked for unsupported facts,
  numerical literals, formulas, units, and conditions.
- Exam priorities are labelled as suggested revision priorities rather than
  guaranteed exam questions.
- Frontend supports compact source-linked rendering and browser print/export.

#### Teach Me Mode

- Added `POST /learning/teach` and
  `POST /learning/teach/{session_id}/answer`.
- Supports Beginner, Intermediate, and Advanced levels.
- Beginner focuses on plain-language definitions, intuition, jargon, examples,
  and recall checks.
- Intermediate focuses on terminology, mechanisms, applications, examples, and
  common mistakes.
- Advanced focuses on mechanisms, assumptions, trade-offs, limitations,
  derivations, and edge cases when supported by the source.
- Level changes depth and teaching style, not facts, scope, or safety policy.
- Understanding checks use strict question schemas and deterministic scoring.
- Frontend provides lesson sections, objectives, source links, checks, grounded
  feedback, and a suggested next step.

### Shared learning backend

- Added `backend/core/learning/models.py` with strict Pydantic generation and
  review schemas using `extra="forbid"`.
- Added `backend/core/learning/validation.py` for deterministic structure,
  citation, scope, duplicate, cycle, graph, numeric, formula, option, and
  independent-review checks.
- Added `backend/core/learning/service.py` for orchestration across scope
  validation, retrieval, bounded context, NVIDIA structured generation,
  validation, review, persistence, cache-key reuse, and stale-source checks.
- Extended `NvidiaReasoningClient` with a structured-generation boundary that
  reuses the configured NVIDIA provider, retry behavior, fallback models, and
  secret-safe telemetry.
- Added source/index version fingerprints to learning artifacts. Artifacts are
  rejected after evidence is deleted or documents are reindexed.
- Added configurable limits:

  ```env
  LEARNING_MAX_CARDS=30
  LEARNING_MAX_QUESTIONS=20
  LEARNING_MAX_NODES=40
  LEARNING_MAX_EDGES=80
  LEARNING_CONTEXT_CHARS=16000
  LEARNING_OUTPUT_CHARS=60000
  ```

- Learning artifacts are stored in the existing SQLite metadata database as
  `learning_artifacts`. Original source files are never copied into artifacts.
- No Neo4j, Redis, Kafka, second model provider, agent framework, or new
  infrastructure dependency was introduced.

### Learning frontend

- Added `frontend/components/learning-workspace.tsx`.
- Added learning API types and route helpers in `frontend/lib/api.ts`.
- Added a compact tabbed UI for Knowledge Graph, Topic Tree, Flashcards, Quiz,
  Cheat Sheet, and Teach Me.
- Reused the current collection selector, document checkboxes, readiness state,
  source links, and visual language.
- Added loading, empty, error, retry/regenerate, stale-source, insufficient-
  evidence, large-graph, answer-hidden, score-review, and source-inspection
  states.
- The existing core upload, ingestion, query, citation, contradiction, and
  evidence-trace UI remains in place.

### Documentation updated

Updated in place:

- `README.md`
- `prd.md`
- `architecture.md`
- `design.md`
- `phases.md`
- `rules.md`
- `.env.example`

The original file was corrected from `contex.md` to `context.md`.

## Latest verification status

### Automated checks

Passed:

```bash
PYTHONPATH=backend .venv/bin/python -m pytest -q
```

Result: **38 passed**.

Passed:

```bash
PYTHONPATH=backend .venv/bin/python -m compileall -q backend
```

Passed:

```bash
cd frontend
npm run lint
npm run build
```

The frontend TypeScript check and Next.js production build both completed
successfully.

### Integrated application smoke checks

The real FastAPI and Next.js production services were started using:

```bash
PYTHONPATH=backend .venv/bin/uvicorn api.fastapi_app:app --host 127.0.0.1 --port 8000
cd frontend && npm run start -- --hostname 127.0.0.1 --port 3000
```

Verified:

- `GET /health` returned HTTP 200 with no secret values.
- The Next.js frontend returned HTTP 200.
- A real README upload was accepted and parsed into evidence.
- Core supported and unsupported query flows worked through the real API.
- Unsupported questions returned `NOT_SUPPORTED` rather than a confident answer.
- Out-of-scope document requests returned HTTP 400.
- Knowledge Graph generation passed through the real route.
- Topic Tree generation passed through the real route.
- Flashcard generation passed through the real route.
- Quiz generation and deterministic submission passed through the real routes.
- Cheat Sheet generation passed through the real route.
- Teach Me Beginner, Intermediate, and Advanced generation passed through the
  real route.
- Multi-document Topic Tree and Cheat Sheet generation preserved both selected
  document IDs and source scope.
- Empty collection and malformed collection/scope cases failed clearly.
- Provider and health responses did not expose API key values.
- Learning artifact listing returned only valid, current, scope-permitted items.

### Blocked or limited integrated checks

- Qdrant was not running in the current environment. Automatic upload processing
  reached the existing documented Qdrant health failure:
  `Qdrant is unavailable. Start Qdrant or verify QDRANT_URL.`
- Because Qdrant was unavailable, the collection did not reach `ready` through
  the full vector-indexing workflow. Keyword fallback and learning route tests
  still ran successfully against parsed SQLite evidence.
- Docker/Qdrant vector indexing and full live vector regression remain blocked
  until the documented Qdrant service is started.
- One multi-document Knowledge Graph retry encountered a transient NVIDIA 502;
  the API returned a provider error and did not persist invalid content.
- Browser click-by-click automation was not run because no browser automation
  binary was installed in the environment. The production frontend build and
  real API/UI startup checks passed.

### Tests not passed, blocked, or not run

The following checks should not be reported as passed:

| Check | Status | Reason |
|---|---|---|
| Full upload → process → NVIDIA embedding → Qdrant index → ready workflow | **BLOCKED** | Qdrant was unavailable at `http://localhost:6335`; automatic ingestion stopped with the documented Qdrant health error. |
| Live Qdrant vector-indexing regression | **BLOCKED** | Docker is not available in the current environment, so the dedicated `docuzrag-qdrant` service could not be started. |
| Full vector acceptance ledger across the bundled `test_doc/` files | **NOT RUN** | The required Qdrant/vector indexing prerequisite was unavailable. Keyword fallback was tested separately. |
| Browser click-by-click frontend automation | **NOT RUN** | No Chromium, Playwright, Puppeteer, or other browser automation binary was installed. |
| One multi-document Knowledge Graph live retry | **FAILED / PROVIDER TRANSIENT** | NVIDIA returned HTTP 502. The API surfaced the provider failure and did not persist invalid learning content. |

The Knowledge Graph provider failure above is an operational retry limitation,
not a schema or scope-validation failure. Other live learning routes and all
three Teach Me levels were exercised successfully through FastAPI. The
automated Python suite, backend compilation, frontend TypeScript check, and
Next.js production build passed.

## Current commands

Install and configure:

```bash
uv sync --locked
source .venv/bin/activate
cp .env.example .env
cd frontend
npm install
cd ..
```

Start Qdrant for the full vector flow:

```bash
docker compose up -d qdrant
```

Start the backend:

```bash
source .venv/bin/activate
PYTHONPATH=backend uvicorn api.fastapi_app:app --reload
```

Start the Next.js frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` and check `http://localhost:8000/health`.

For local operation without Qdrant, set this private environment value:

```env
RETRIEVAL_MODE=keyword
```

## Current overall status

The core DocuzRAG architecture and the six requested learning features are
implemented. The backend preserves collection/document scope, existing
retrieval and evidence boundaries, NVIDIA NIM integration, source citations,
guardrails, and deterministic quiz scoring. The frontend is responsive and
organized as one focused learning activity at a time rather than a crowded
single form.

The offline automated suite and frontend production build pass. Full vector
indexing and live Qdrant regression are operationally pending because Qdrant was
not running during the latest verification. NVIDIA-backed learning generation
is configuration-dependent and fails safely with provider errors when the
service is unavailable.

## Recent Fixes & Additions (October 2026)

### Additions
- **History & New Chat:** Added a full chat history sidebar that persists across sessions via `localStorage` and a "New Chat" button to seamlessly start fresh sessions without reloading.
- **State Persistence:** Each learning tab (Topic Tree, Knowledge Graph, Quiz, etc.) now independently maintains its state. Users can switch between tabs without losing their generated artifacts, quiz scores, or lesson progress.
- **Select All Documents:** Added a "Select all / Deselect all" toggle button to the document evidence panel, eliminating the need to manually click each document.
- **UI Enhancements:** Rebuilt the Flashcard component to include realistic 3D flip animations using CSS transforms, toggling cleanly between question and answer sides.
- **Interactive Tree Navigation:** Topic Tree nodes can now be expanded and collapsed by clicking the title, improving navigation usability.

### Fixes
- **Tesseract OCR Integration:** Fixed a critical version parsing bug (`v5.5.3` prefix causing integer parsing failure). Tesseract OCR is now correctly invoked for image-only PDFs and scanned documents, seamlessly feeding text to the QA pipeline.
- **Source-Based QA Deep Retrieval:** Increased the semantic retrieval `top_k` chunk limit from 6 to 15. This allows the system to fetch core definitions (like VLANs and Virtual Machines) buried deep within large documents instead of surface-level mentions.
- **Teach Me Evaluation Error (422):** Fixed a strict Pydantic validation error (`422 Unprocessable Entity`) by aligning `TeachAnswerRequest` schema length bounds with the batched-ID prefix standard and officially accepting the frontend's `collection_id` payload.
- **Multiple Lesson Checks UI:** The Teach View UI now accepts and maps a record of answers, allowing users to evaluate multiple understanding checks within the same lesson simultaneously without overwriting previous feedback.
- **Feature Generation Without Topic:** Overhauled the fallback retrieval query. When a user requests a specific format (e.g., "Formula Sheet") without providing a topic, the backend dynamically injects format and kind instructions into the BM25 query to surface mathematically relevant chunks, preventing "unsupported learning activity" generation failures.
- **Empty-Topic Quiz Generation:** Removed a strict LLM guardrail ("return 0 items if unrelated to topic") when the requested topic is empty, allowing the model to freely extract general overview knowledge for quizzes.
- **Multi-Batch Generation Consistency:** Fixed batch merging logic to properly merge Knowledge Graph `edges` and Cheat Sheet `sections` across large, multi-document batch generations.

### Remaining Issues / Operational Notes
- None currently flagged. The system relies heavily on valid external API configurations (NVIDIA NIM endpoints). If an LLM response rate-limits or times out, the backend gracefully catches and surfaces it, but large artifacts (like Knowledge Graphs) can occasionally take significant time to render when reading large texts.
