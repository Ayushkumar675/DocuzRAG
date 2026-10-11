"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar, { NavTab } from "../components/sidebar";
import Header from "../components/header";

// Views
import ChatView from "../components/views/chat-view";
import UploadView from "../components/views/upload-view";
import KnowledgeGraphView from "../components/views/knowledge-graph-view";
import FlashcardsView from "../components/views/flashcards-view";
import QuizzesView from "../components/views/quizzes-view";
import TopicTreeView from "../components/views/topic-tree-view";
import CheatSheetView from "../components/views/cheat-sheet-view";
import TeachMeView from "../components/views/teach-me-view";
import LibraryView from "../components/views/library-view";

import {
  answerTeach,
  askQuestion,
  Collection,
  createCollection,
  Document,
  generateLearning,
  getIngestionStatus,
  getProviderSettings,
  getQueryGuardrails,
  IngestionStatus,
  LearningArtifact,
  LearningGenerateInput,
  LearningKind,
  listCollections,
  listDocuments,
  prepareCollection,
  ProviderKeys,
  ProviderStatus,
  QueryResponse,
  saveProviderSettings,
  TeachAnswer,
  uploadDocuments,
} from "../lib/api";

const tabTitleMap: Record<NavTab, string> = {
  "chat": "DocuNova Intelligence",
  "upload-documents": "Document Ingestion",
  "knowledge-graph": "Knowledge Graph",
  "flashcards": "Active Recall Flashcards",
  "quizzes": "Deterministic Quizzes",
  "topic-tree-and-summary": "Topic Tree & Summary",
  "cheat-sheet": "Synthesized Cheat Sheet",
  "teach-me-mode": "Teach Me",
  "library": "Document Library",
  "collections": "Collections Vault",
  "history": "Query & Study History",
  "settings": "System & Engine Settings",
};

export default function Home() {
  const [currentTab, setCurrentTab] = useState<NavTab>("chat");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core Data
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ingestion, setIngestion] = useState<IngestionStatus | null>(null);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [guardrails, setGuardrails] = useState<string[]>([]);

  // Interaction State
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [querying, setQuerying] = useState(false);
  const [working, setWorking] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [history, setHistory] = useState<Array<{ question: string; result: QueryResponse; date: string }>>([]);
  const [bannerMessage, setBannerMessage] = useState("");
  const [errorBanner, setErrorBanner] = useState("");

  // Learning Artifacts & Evaluation State
  const [artifacts, setArtifacts] = useState<Partial<Record<LearningKind, LearningArtifact>>>({});
  const [teachAnswers, setTeachAnswers] = useState<Record<string, TeachAnswer>>({});
  const [learningLoading, setLearningLoading] = useState(false);

  // Ingestion status flags
  const ingestionBusy = ingestion?.busy ?? false;
  const isReady = ingestion?.ready ?? false;
  const frozen = working || querying || ingestionBusy || loadingCollection;

  const collection = useMemo(() => collections.find((item) => item.id === collectionId), [collections, collectionId]);
  
  // Calculate active scope for queries and features
  const scopeIds = useMemo(() => {
    if (selectedIds.length > 0) return selectedIds;
    return documents.map((doc) => doc.id);
  }, [selectedIds, documents]);

  const canQuery =
    !frozen &&
    selectedIds.length > 0 &&
    selectedIds.every((id) => ingestion?.indexed_document_ids.includes(id)) &&
    Boolean(providers?.reasoning.configured);

  // Initialize theme and restore persisted chat state
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("docunova_theme") as "light" | "dark" | null;
      const effectiveTheme = savedTheme || "dark";
      setTheme(effectiveTheme);
      if (effectiveTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch {
      // ignore SSR or storage restrictions
    }

    try {
      const savedChat = localStorage.getItem("docunova_chat_state");
      if (savedChat) {
        const parsed = JSON.parse(savedChat);
        if (parsed.result) setResult(parsed.result);
        if (parsed.history) setHistory(parsed.history);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("docunova_theme", nextTheme);
    } catch {
      // ignore
    }
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Persist chat state
  useEffect(() => {
    try {
      localStorage.setItem("docunova_chat_state", JSON.stringify({ result, history }));
    } catch {
      // ignore
    }
  }, [result, history]);

  // Initial fetch: collections, provider settings, guardrails
  useEffect(() => {
    listCollections()
      .then((items) => {
        setCollections(items);
        if (items[0]) setCollectionId(items[0].id);
      })
      .catch((err: Error) => setErrorBanner(err.message));

    getProviderSettings()
      .then(setProviders)
      .catch((err: Error) => setErrorBanner(err.message));

    getQueryGuardrails()
      .then((plan) => setGuardrails(plan.guardrails))
      .catch(() => undefined);
  }, []);

  // Poll collection documents and ingestion status
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isInitialSync = true;

    setResult(null);
    setSelectedIds([]);
    setSelectedDocIds([]);
    setSelectedDocId("");
    setIngestion(null);
    setDocuments([]);
    setErrorBanner("");

    if (!collectionId) return () => controller.abort();
    setLoadingCollection(true);

    async function refresh() {
      try {
        const [items, status] = await Promise.all([
          listDocuments(collectionId, controller.signal),
          getIngestionStatus(collectionId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setDocuments(items);
        const itemIds = items.map((d) => d.id);

        if (isInitialSync) {
          if (itemIds.length > 0) {
            setSelectedIds(itemIds);
            setSelectedDocIds(itemIds);
            setSelectedDocId(itemIds[0] ?? "");
            isInitialSync = false;
          }
        } else {
          // Keep user's explicit selection (including empty array when all are deselected)
          // Only filter out any deleted document IDs
          setSelectedIds((prev) => prev.filter((id) => itemIds.includes(id)));
          setSelectedDocIds((prev) => prev.filter((id) => itemIds.includes(id)));
          setSelectedDocId((prev) => (itemIds.includes(prev) ? prev : (itemIds[0] ?? "")));
        }
        setIngestion(status);
        setLoadingCollection(false);
        timer = setTimeout(refresh, status.busy ? 1000 : 3000);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setErrorBanner(reason instanceof Error ? reason.message : "Could not load collection.");
        setLoadingCollection(false);
        timer = setTimeout(refresh, 3000);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [collectionId]);

  // Actions
  const handleToggleDoc = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAllDocs = (select: boolean) => {
    setSelectedIds(select ? documents.map((doc) => doc.id) : []);
  };

  const handleSelectDocId = (docId: string) => {
    setSelectedDocId(docId);
    setSelectedDocIds(docId ? [docId] : []);
  };

  const handleSelectDocIds = (ids: string[]) => {
    setSelectedDocIds(ids);
    if (ids.length > 0) {
      setSelectedDocId(ids[0]);
    }
  };

  const handleCreateCollection = async (name: string) => {
    if (!name.trim() || frozen) return;
    setWorking(true);
    setErrorBanner("");
    try {
      const item = await createCollection(name.trim());
      setCollections((curr) => [item, ...curr]);
      setCollectionId(item.id);
      setBannerMessage(`Collection "${item.name}" created successfully.`);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!collectionId || !files.length || frozen) return;
    setWorking(true);
    setErrorBanner("");
    setBannerMessage(`Uploading ${files.length} file(s) into DocuNova...`);
    try {
      const uploaded = await uploadDocuments(collectionId, files);
      const updatedDocs = await listDocuments(collectionId);
      setDocuments(updatedDocs);
      const allIds = updatedDocs.map((d) => d.id);
      setSelectedIds(allIds);
      setSelectedDocIds(allIds);
      if (updatedDocs[0]) {
        setSelectedDocId(updatedDocs[0].id);
      }
      setIngestion(await getIngestionStatus(collectionId));
      setBannerMessage("Documents uploaded! Background processing and indexing started.");
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handlePrepareDocuments = async () => {
    if (frozen || !collectionId) return;
    setWorking(true);
    setErrorBanner("");
    try {
      await prepareCollection(collectionId);
      setIngestion(await getIngestionStatus(collectionId));
      setBannerMessage("Indexing started for unindexed documents.");
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handleAskQuestion = async (queryText: string) => {
    if (!canQuery || !queryText.trim()) return;
    setQuerying(true);
    setErrorBanner("");
    try {
      const activeScope = selectedIds.length > 0 ? selectedIds : null;
      const res = await askQuestion(collectionId, queryText.trim(), activeScope);
      setResult(res);
      setHistory((curr) => [
        { question: queryText.trim(), result: res, date: new Date().toISOString() },
        ...curr,
      ]);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setQuerying(false);
    }
  };

  const handleSaveKeys = async (keys: ProviderKeys) => {
    setWorking(true);
    try {
      const updated = await saveProviderSettings(keys);
      setProviders(updated);
      setBannerMessage("Pro Engine credentials saved.");
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  // Learning Generator Handler
  const handleGenerateMode = async (
    kind: LearningKind,
    params: Partial<LearningGenerateInput> & { selected_document_ids?: string[] | null } = {},
    regenerate = false
  ) => {
    if (!collectionId || !isReady || learningLoading) return;
    setLearningLoading(true);
    setErrorBanner("");
    try {
      const targetDocScope =
        params.selected_document_ids !== undefined
          ? params.selected_document_ids
          : selectedDocIds.length > 0
          ? selectedDocIds
          : selectedDocId
          ? [selectedDocId]
          : null;
      const input: LearningGenerateInput = {
        collection_id: collectionId,
        selected_document_ids: targetDocScope,
        topic: params.topic || "",
        difficulty: params.difficulty || "medium",
        level: params.level || "beginner",
        count: params.count || 6,
        format: params.format || "quick_revision",
        regenerate,
      };
      const artifactResult = await generateLearning(kind, input);
      setArtifacts((prev) => ({ ...prev, [kind]: artifactResult }));
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setLearningLoading(false);
    }
  };

  const handleSubmitTeachCheck = async (checkId: string, answer: number) => {
    const teachArt = artifacts["teach"];
    if (!teachArt) return;
    try {
      const targetDocScope =
        selectedDocIds.length > 0 ? selectedDocIds : selectedDocId ? [selectedDocId] : null;
      const resp = await answerTeach(teachArt.id, collectionId, targetDocScope, checkId, answer);
      setTeachAnswers((prev) => ({ ...prev, [checkId]: resp }));
    } catch (err) {
      setErrorBanner((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base text-on-surface flex flex-col font-body-md selection:bg-indigo-500/30 selection:text-white transition-colors duration-200">
      {/* Persistent Left Navigation Sidebar */}
      <Sidebar
        activeTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setMobileMenuOpen(false);
        }}
        documentCount={documents.length}
        collectionName={collection?.name}
        isReady={isReady}
      />

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Fixed Header Bar without notification/profile icons */}
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          title={tabTitleMap[currentTab] || "DocuNova"}
          isBusy={frozen}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Floating System Messages & Notifications */}
        <div className="pt-16 px-4 md:px-8 max-w-7xl w-full mx-auto">
          {bannerMessage && (
            <div className="mt-4 p-3 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 rounded-xl text-sm flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">info</span>
                <span>{bannerMessage}</span>
              </div>
              <button
                onClick={() => setBannerMessage("")}
                className="text-on-surface-variant hover:text-white"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          {errorBanner && (
            <div className="mt-4 p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-sm flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{errorBanner}</span>
              </div>
              <button
                onClick={() => setErrorBanner("")}
                className="text-on-surface-variant hover:text-white"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}
        </div>

        {/* View Switcher Container */}
        <main className="w-full flex-1 px-4 md:px-8 pb-12 max-w-7xl mx-auto flex flex-col">
          {currentTab === "chat" && (
            <ChatView
              collection={collection}
              documents={documents}
              selectedIds={selectedIds}
              onToggleDoc={handleToggleDoc}
              onSelectAllDocs={handleSelectAllDocs}
              ingestion={ingestion}
              onNavigateTab={setCurrentTab}
              canQuery={canQuery}
              querying={querying}
              frozen={frozen}
              onAsk={handleAskQuestion}
              result={result}
              onClearChat={() => setResult(null)}
              history={history}
              onSelectHistory={(item) => setResult(item.result)}
              onClearHistory={() => setHistory([])}
            />
          )}

          {currentTab === "upload-documents" && (
            <UploadView
              documents={documents}
              onUploadFiles={handleUploadFiles}
              onPrepareDocuments={handlePrepareDocuments}
              ingestion={ingestion}
              frozen={frozen}
              onNavigateTab={setCurrentTab}
            />
          )}

          {currentTab === "knowledge-graph" && (
            <KnowledgeGraphView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              isReady={isReady}
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {currentTab === "flashcards" && (
            <FlashcardsView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              isReady={isReady}
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {currentTab === "quizzes" && (
            <QuizzesView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              isReady={isReady}
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {currentTab === "topic-tree-and-summary" && (
            <TopicTreeView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              artifact={artifacts["topic-tree"] ?? null}
              loading={learningLoading}
              ready={isReady}
              onGenerate={(topic, regen, ids) =>
                handleGenerateMode(
                  "topic-tree",
                  { topic, selected_document_ids: ids ?? selectedDocIds },
                  regen
                )
              }
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {currentTab === "cheat-sheet" && (
            <CheatSheetView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              artifact={artifacts["cheat-sheet"] ?? null}
              loading={learningLoading}
              ready={isReady}
              onGenerate={(format, topic, regen, ids) =>
                handleGenerateMode(
                  "cheat-sheet",
                  { format, topic, selected_document_ids: ids ?? selectedDocIds },
                  regen
                )
              }
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {currentTab === "teach-me-mode" && (
            <TeachMeView
              collectionId={collectionId}
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocId={handleSelectDocId}
              selectedDocIds={selectedDocIds}
              onSelectDocIds={handleSelectDocIds}
              artifact={artifacts["teach"] ?? null}
              loading={learningLoading}
              ready={isReady}
              teachAnswers={teachAnswers}
              onGenerate={(level, topic, regen, ids) =>
                handleGenerateMode(
                  "teach",
                  { level, topic, selected_document_ids: ids ?? selectedDocIds },
                  regen
                )
              }
              onSubmitCheck={handleSubmitTeachCheck}
              onNavigateUpload={() => setCurrentTab("upload-documents")}
            />
          )}

          {(currentTab === "library" || currentTab === "collections" || currentTab === "settings") && (
            <LibraryView
              collections={collections}
              activeCollectionId={collectionId}
              onSelectCollection={setCollectionId}
              onCreateCollection={handleCreateCollection}
              documents={documents}
              selectedDocumentIds={selectedIds}
              onToggleDocument={handleToggleDoc}
              onSelectAllDocuments={handleSelectAllDocs}
              ingestion={ingestion}
              onNavigateUpload={() => setCurrentTab("upload-documents")}
              providers={providers}
              onSaveKeys={handleSaveKeys}
            />
          )}

          {currentTab === "history" && (
            <div className="flex flex-col gap-4 py-6">
              <div className="flex items-center justify-between pb-4 border-b border-border-glass">
                <div>
                  <h1 className="font-headline-lg text-headline-lg text-text-crisp-white">
                    Query &amp; Research History
                  </h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Previous grounded answers, synthesis results, and evidence trails.
                  </p>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    type="button"
                    className="px-3 py-1.5 rounded-xl bg-surface-elevated border border-border-glass text-rose-400 text-sm hover:border-rose-500/40"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="p-12 text-center text-on-surface-variant bg-surface-elevated rounded-2xl border border-border-glass">
                  No query history recorded yet. Ask questions in Chat to record evidence trails.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setResult(item.result);
                        setCurrentTab("chat");
                      }}
                      className="p-4 bg-surface-elevated border border-border-glass hover:border-indigo-500/40 rounded-2xl cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-text-crisp-white group-hover:text-indigo-400 transition-colors">
                          {item.question}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                          {new Date(item.date).toLocaleString()} • {item.result.evidence.length} sources cited
                        </span>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 group-hover:text-white transition-all">
                        arrow_forward
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
