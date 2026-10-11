export type Collection = {
  id: string; name: string; created_at: string; document_count: number;
};

export type Document = {
  id: string; collection_id: string; filename: string; file_type: string;
  size: number; page_count: number | null; status: string; created_at: string;
};

export type IngestionStatus = {
  collection_id: string; busy: boolean; ready: boolean;
  indexed_document_ids: string[];
  job: { id: string; status: string; detail: string; created_at?: string; updated_at?: string; duration_seconds?: number } | null;
};

export type Provider = "reasoning" | "embedding" | "reranker" | "ocr" | "vision";
export type ProviderStatus = Record<Provider, { model: string; configured: boolean }>;
export type ProviderKeys = {
  nvidia_api_key?: string;
  nvidia_reranker_api_key?: string;
};

export type Evidence = {
  evidence_id: string; collection_id: string; document_id: string;
  filename: string; page_number: number | null; content_type: string;
  source_reference: string; text: string | null;
  retrieval_score: number; vector_score: number | null; keyword_score: number | null;
  fusion_score: number | null; rerank_score: number | null;
};

export type LearningEvidence = {
  evidence_id: string; collection_id: string; document_id: string;
  filename: string; page_number: number | null; content_type: string;
  source_reference: string; text: string | null;
};

export type LearningKind = "knowledge-graph" | "topic-tree" | "flashcards" | "quizzes" | "cheat-sheet" | "teach";
export type LearningArtifact = {
  id: string; kind: LearningKind; collection_id: string;
  selected_document_ids: string[]; created_at: string;
  parameters: { topic?: string; difficulty?: string; level?: string; count?: number; format?: string };
  content: any; warnings: string[]; evidence: LearningEvidence[];
};

export type QuizSubmission = {
  score: number; total: number; percentage: number;
  review: Array<{
    id: string; question: string; options: string[]; correct_answer: number;
    selected_answer: number | null; correct: boolean; explanation: string; source_evidence_ids: string[];
  }>;
  evidence: LearningEvidence[];
};

export type TeachAnswer = {
  check_id: string; correct: boolean; feedback: string; correct_answer: number;
  source_evidence_ids: string[]; next_level: string; next_step: string; evidence: LearningEvidence[];
};

export type QueryResponse = {
  answer: string; answerability: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED";
  verified: boolean; citations: string[]; verification_issues: string[];
  evidence: Evidence[];
  claims: Array<{ claim_id: string; text: string; evidence_ids: string[];
    verified: boolean; contradiction_status: string }>;
  contradictions: Array<{ subject: string; status: string; explanation: string;
    values: Array<{ value: string; raw_value: string; evidence_id: string }> }>;
  guardrails_invoked: string[]; services_invoked: string[]; response_mode: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const listCollections = () => request<Collection[]>("/collections");
export const listDocuments = (id: string, signal?: AbortSignal) =>
  request<Document[]>(`/collections/${id}/documents`, { signal });
export const getIngestionStatus = (id: string, signal?: AbortSignal) =>
  request<IngestionStatus>(`/collections/${id}/ingestion`, { signal });
export const getProviderSettings = () => request<ProviderStatus>("/settings/providers");
export const getQueryGuardrails = () => request<{ guardrails: string[] }>("/query/guardrails");
export const createCollection = (name: string) => request<Collection>("/collections", {
  method: "POST", body: JSON.stringify({ name }),
});
export const askQuestion = (id: string, question: string, selectedDocumentIds?: string[] | null) =>
  request<QueryResponse>(`/collections/${id}/query`, { method: "POST",
    body: JSON.stringify({ question, selected_document_ids: selectedDocumentIds && selectedDocumentIds.length ? selectedDocumentIds : null }),
  });
export function uploadDocuments(id: string, files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return request<{ collection_id: string; documents: Document[]; job_id: string }>(
    `/collections/${id}/documents`, { method: "POST", body },
  );
}
export const prepareCollection = (id: string) => request<{ id: string; status: string }>(
  `/collections/${id}/prepare`, { method: "POST" },
);
export const saveProviderSettings = (values: ProviderKeys) => request<ProviderStatus>(
  "/settings/providers", { method: "POST", body: JSON.stringify(values) },
);
export const sourceUrl = (evidence: Evidence) =>
  `${API_BASE_URL}/collections/${evidence.collection_id}/documents/${evidence.document_id}/source`
  + (evidence.page_number ? `#page=${evidence.page_number}` : "");

export const learningSourceUrl = (evidence: LearningEvidence) =>
  `${API_BASE_URL}/collections/${evidence.collection_id}/documents/${evidence.document_id}/source`
  + (evidence.page_number ? `#page=${evidence.page_number}` : "");

export const documentSourceUrl = (collectionId: string, documentId: string) =>
  `${API_BASE_URL}/collections/${collectionId}/documents/${documentId}/source`;

export type LearningGenerateInput = {
  collection_id: string; selected_document_ids: string[] | null; topic: string;
  difficulty: "easy" | "medium" | "hard"; level: "beginner" | "intermediate" | "advanced";
  count: number; format: "quick_revision" | "key_concepts" | "formula_sheet" | "comparison_table" | "exam_outline" | "last_minute";
  question_type?: "mixed" | "single_choice" | "true_false";
  regenerate?: boolean;
};

const learningGeneratePaths: Record<LearningKind, string> = {
  "knowledge-graph": "/learning/knowledge-graph",
  "topic-tree": "/learning/topic-tree",
  "flashcards": "/learning/flashcards/generate",
  "quizzes": "/learning/quizzes/generate",
  "cheat-sheet": "/learning/cheat-sheet",
  teach: "/learning/teach",
};

export const generateLearning = (kind: LearningKind, input: LearningGenerateInput) =>
  request<LearningArtifact>(learningGeneratePaths[kind], { method: "POST", body: JSON.stringify(input) });

export const submitQuiz = (quizId: string, collectionId: string, selectedDocumentIds?: string[] | null, answers: Record<string, number> = {}) =>
  request<QuizSubmission>(`/learning/quizzes/${quizId}/submit`, {
    method: "POST", body: JSON.stringify({ collection_id: collectionId, selected_document_ids: selectedDocumentIds && selectedDocumentIds.length ? selectedDocumentIds : null, answers }),
  });

export const answerTeach = (sessionId: string, collectionId: string, selectedDocumentIds?: string[] | null, checkId: string = "", answer: number = 0) =>
  request<TeachAnswer>(`/learning/teach/${sessionId}/answer`, {
    method: "POST", body: JSON.stringify({ collection_id: collectionId, selected_document_ids: selectedDocumentIds && selectedDocumentIds.length ? selectedDocumentIds : null, check_id: checkId, answer }),
  });
