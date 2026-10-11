# DocuzRAG — Product Requirements Document

## 1. Product Overview
DocuzRAG is an agentic multimodal document intelligence platform for ingesting, searching, comparing, reasoning over, and verifying information across collections containing PDFs, DOCX, TXT/Markdown files, images, tables, charts, and scanned documents.

Core principle: **Evidence is more important than fluent generation.**

## 2. Goals
- Multi-document and mixed-format upload.
- OCR, table, chart, image, and text understanding.
- NVIDIA NIM reasoning, embedding, reranking, OCR, and vision models, with separate provider credentials.
- Hybrid retrieval + reranking.
- Cross-document reasoning and evidence fusion.
- Source-level citations and evidence graph.
- Contradiction detection.
- Deterministic calculations with Python.
- RAG evaluation.
- Production-oriented security and guardrails.

## 3. Non-Goals
No unrestricted web agent, arbitrary shell/code execution, email automation, Kubernetes/Kafka/Redis without a real need, unnecessary microservices, or foundation-model training.

## 4. Core Flow
```text
Upload → Validate → Collection → Parse/OCR → Chunk → Embed → Qdrant
Question → Scope Filter → Hybrid Retrieval → Rerank → Agent Tools
→ Evidence Fusion → Generate → Verify Claims → Validate Citations → Answer
```

## 5. Flagship Features
### Agentic RAG
Allowed tasks include retrieval, metadata search, image analysis, comparison, calculation, and verification.

### Multimodal Understanding
Support text, scanned PDFs, tables, charts, diagrams, and images.

### Multi-Document Chat
One collection can contain many documents and one chat can reason across them.

### Evidence Graph
```text
Claim → Evidence → Page/Image/Table → Document
```

### Contradiction Detection
Conflicting values or statements from different sources must be surfaced.

### Calculation Agent
LLM extracts values; deterministic Python performs arithmetic.

### Evaluation Dashboard
Measure Recall, Precision@K, MRR, Context Relevance, Citation Coverage, Faithfulness/Groundedness, Contradiction Rate, Answerability, Latency, and tool success rate. Never fabricate metrics.

## 6. Mandatory Guardrails
1. Never make factual claims without supporting evidence.
2. Abstain when evidence is insufficient.
3. Every verified claim must map to actual evidence.
4. Never invent citations, page numbers, quotes, values, or evidence IDs.
5. Uploaded documents are untrusted data; document instructions never override system/application rules.
6. Enforce collection and selected-document scope before retrieval.
7. Detect and expose contradictions.
8. Use deterministic Python for important arithmetic.
9. Use an explicit tool allowlist; no arbitrary shell, code, filesystem, web, or email access.
10. Never expose API keys, secrets, system prompts, internal metadata, or unauthorized document content.
11. Distinguish TEXT, TABLE, OCR, IMAGE, VISION, CALCULATION, and LLM_INFERENCE evidence.
12. Verify claims and citations before displaying the final answer.

## 7. Tech Stack
- Python
- Streamlit initially
- FastAPI service layer
- Next.js/React later
- NVIDIA NIM
- Qdrant
- SQLite
- Filesystem document store
- PyMuPDF/python-docx/Pillow/OCR pipeline
- Hybrid retrieval + reranking

No local scikit-learn, TensorFlow, or PyTorch training is required for the core application.

## 8. Configuration
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
If the NVIDIA key is missing, request configuration from the developer/operator. Never guess, hard-code, print, or log it.

## 8.1 Learning Workspace (implemented)
The Next.js evidence workspace includes a scoped Learning Workspace with six
activities: Knowledge Graph, Topic Tree, Flashcards, Quiz, Cheat Sheet, and
Teach Me. Each activity retrieves source evidence through the existing hybrid
retriever, validates source IDs against the selected collection/documents,
generates strict structured output with the configured NVIDIA reasoning client,
and independently checks the result before persisting it in the existing
SQLite metadata database. Quiz/check scoring is deterministic Python. Since
DocuzRAG has no user identity service, flashcard ratings and tutor progress are
session-local browser state; durable artifacts store source references and a
source/index version fingerprint only.

## 9. Acceptance Criteria
The flagship demo must show mixed-format multi-document RAG, PDF+image reasoning, citations, evidence graph, contradiction detection, deterministic calculations, prompt-injection resistance, scope filtering, unsupported-query abstention, final claim verification, and real evaluation metrics.
All learning features (Knowledge Graph, Topic Tree, Flashcards, Quizzes, Cheat Sheet, Teach Me) must be independently navigable with preserved states, complete with deep chunk retrieval and multi-document batch generation optimizations.
