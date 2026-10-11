"use client";

import { useMemo, useState } from "react";
import { Collection, Document, IngestionStatus, ProviderKeys, ProviderStatus, documentSourceUrl } from "../../lib/api";

interface LibraryViewProps {
  collections: Collection[];
  activeCollectionId: string;
  onSelectCollection: (id: string) => void;
  onCreateCollection: (name: string) => Promise<void>;
  documents: Document[];
  selectedDocumentIds: string[];
  onToggleDocument: (id: string) => void;
  onSelectAllDocuments: (all: boolean) => void;
  ingestion: IngestionStatus | null;
  onNavigateUpload: () => void;
  providers: ProviderStatus | null;
  onSaveKeys: (keys: ProviderKeys) => Promise<void>;
}

export default function LibraryView({
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onSelectAllDocuments,
  ingestion,
  onNavigateUpload,
  providers,
  onSaveKeys,
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [typeFilter, setTypeFilter] = useState<"all" | "pdf" | "other">("all");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingColl, setCreatingColl] = useState(false);

  // Settings form keys
  const [keyReasoning, setKeyReasoning] = useState("");
  const [keyReranker, setKeyReranker] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);
  const [keyMessage, setKeyMessage] = useState("");

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
      if (typeFilter === "pdf") return doc.filename.toLowerCase().endsWith(".pdf");
      if (typeFilter === "other") return !doc.filename.toLowerCase().endsWith(".pdf");
      return true;
    });
  }, [documents, searchQuery, typeFilter]);

  const allSelected = documents.length > 0 && selectedDocumentIds.length === documents.length;

  const totalSizeMB = useMemo(() => {
    const totalBytes = documents.reduce((acc, d) => acc + (d.size || 0), 0);
    return (totalBytes / (1024 * 1024)).toFixed(1);
  }, [documents]);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    setCreatingColl(true);
    try {
      await onCreateCollection(newCollectionName.trim());
      setNewCollectionName("");
    } finally {
      setCreatingColl(false);
    }
  };

  const handleSaveKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeys(true);
    setKeyMessage("");
    try {
      const updatePayload: ProviderKeys = {};
      if (keyReasoning.trim()) updatePayload.nvidia_api_key = keyReasoning.trim();
      if (keyReranker.trim()) updatePayload.nvidia_reranker_api_key = keyReranker.trim();
      await onSaveKeys(updatePayload);
      setKeyMessage("API Keys saved securely in backend session.");
      setKeyReasoning("");
      setKeyReranker("");
      setTimeout(() => setShowSettingsModal(false), 1500);
    } catch {
      setKeyMessage("Failed to save keys.");
    } finally {
      setSavingKeys(false);
    }
  };

  return (
    <div className="flex flex-col w-full relative">
      {/* Ambient background glows */}
      <div className="absolute -top-24 -left-20 w-96 h-96 bg-indigo-600/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/2 right-0 w-80 h-80 bg-violet-600/10 dark:bg-violet-600/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6 pb-6 border-b border-border-glass mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm text-indigo-400 uppercase tracking-widest font-bold">
              Workspace Repository
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">Synapse Vault</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-text-crisp-white tracking-tight">
            Document Library
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Manage, structure, and explore technical reference material for AI synthesis.
          </p>
        </div>

        {/* Action Cluster */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Search documents input */}
          <div className="relative min-w-[220px] lg:min-w-[260px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, tags..."
              type="text"
              className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border-glass rounded-xl font-body-sm text-body-sm text-text-crisp-white placeholder:text-on-surface-variant/70 focus:outline-none focus:border-indigo-500/60 shadow-sm transition-all"
            />
          </div>

          {/* View mode toggle buttons */}
          <div className="flex items-center bg-surface-elevated p-1 rounded-xl border border-border-glass shadow-sm">
            <button
              onClick={() => setViewMode("list")}
              aria-label="List view"
              type="button"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                viewMode === "list"
                  ? "bg-surface-base text-indigo-400 border border-border-glass shadow-sm"
                  : "text-on-surface-variant hover:text-text-crisp-white"
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">view_list</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              type="button"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                viewMode === "grid"
                  ? "bg-surface-base text-indigo-400 border border-border-glass shadow-sm"
                  : "text-on-surface-variant hover:text-text-crisp-white"
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">grid_view</span>
            </button>
          </div>

          {/* Settings / Provider Keys Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-elevated hover:bg-surface-base border border-border-glass rounded-xl font-label-md text-label-md text-on-surface transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px] text-indigo-400">key</span>
            <span>API Keys</span>
          </button>

          {/* Upload New Primary CTA */}
          <button
            onClick={onNavigateUpload}
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-title-md text-title-md shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>Upload New</span>
          </button>
        </div>
      </div>

      {/* Quick Stats Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface-elevated border border-border-glass p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-medium">
              Total Files
            </span>
            <span className="font-headline-sm text-headline-sm text-text-crisp-white mt-0.5 font-bold">
              {documents.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-950/40 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
            <span className="material-symbols-outlined text-[22px]">folder_open</span>
          </div>
        </div>

        <div className="bg-surface-elevated border border-border-glass p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-medium">
              Processed
            </span>
            <span className="font-headline-sm text-headline-sm text-text-crisp-white mt-0.5 font-bold">
              {ingestion?.indexed_document_ids.length ?? 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
            <span className="material-symbols-outlined text-[22px]">verified</span>
          </div>
        </div>

        <div className="bg-surface-elevated border border-border-glass p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-medium">
              Index Coverage
            </span>
            <span className="font-headline-sm text-headline-sm text-text-crisp-white mt-0.5 font-bold">
              {documents.length > 0
                ? `${Math.round(((ingestion?.indexed_document_ids.length ?? 0) / documents.length) * 100)}%`
                : "0%"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400">
            <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
          </div>
        </div>

        <div className="bg-surface-elevated border border-border-glass p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-medium">
              Storage Used
            </span>
            <span className="font-headline-sm text-headline-sm text-text-crisp-white mt-0.5 font-bold">
              {Number(totalSizeMB) > 0 ? `${totalSizeMB} MB` : "0 MB"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-950/40 border border-violet-800/40 flex items-center justify-center text-violet-400">
            <span className="material-symbols-outlined text-[22px]">cloud</span>
          </div>
        </div>
      </div>

      {/* Collection Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-elevated border border-border-glass rounded-xl mb-4">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase shrink-0">
            Collection:
          </span>
          {collections.map((coll) => (
            <button
              key={coll.id}
              onClick={() => onSelectCollection(coll.id)}
              type="button"
              className={`px-3 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${
                coll.id === activeCollectionId
                  ? "bg-indigo-600 text-white font-semibold shadow-sm"
                  : "bg-surface-base text-on-surface-variant hover:text-text-crisp-white border border-border-glass"
              }`}
            >
              {coll.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreateCollection} className="flex items-center gap-2">
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="+ New Collection..."
            type="text"
            className="px-3 py-1 bg-surface-base border border-border-glass rounded-lg text-body-sm text-text-crisp-white placeholder:text-on-surface-variant/70 focus:outline-none focus:border-indigo-500/50"
          />
          <button
            type="submit"
            disabled={!newCollectionName.trim() || creatingColl}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-label-sm text-label-sm rounded-lg"
          >
            Create
          </button>
        </form>
      </div>

      {/* Main Data Table Container */}
      <div className="bg-surface-elevated/95 border border-border-glass rounded-2xl shadow-2xl overflow-hidden">
        {/* Table Filter Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-surface-base/70 border-b border-border-glass flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Filter type:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTypeFilter("all")}
                type="button"
                className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${
                  typeFilter === "all"
                    ? "bg-indigo-950 border border-indigo-700/50 text-indigo-300 font-semibold"
                    : "bg-surface-elevated text-on-surface-variant hover:text-text-crisp-white"
                }`}
              >
                All Documents ({documents.length})
              </button>
              <button
                onClick={() => setTypeFilter("pdf")}
                type="button"
                className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${
                  typeFilter === "pdf"
                    ? "bg-indigo-950 border border-indigo-700/50 text-indigo-300 font-semibold"
                    : "bg-surface-elevated text-on-surface-variant hover:text-text-crisp-white"
                }`}
              >
                PDFs
              </button>
              <button
                onClick={() => setTypeFilter("other")}
                type="button"
                className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${
                  typeFilter === "other"
                    ? "bg-indigo-950 border border-indigo-700/50 text-indigo-300 font-semibold"
                    : "bg-surface-elevated text-on-surface-variant hover:text-text-crisp-white"
                }`}
              >
                Text &amp; Markdown
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectAllDocuments(!allSelected)}
              type="button"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded bg-surface-base border border-border-glass"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-base/50 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-border-glass">
                <th className="py-3.5 pl-6 pr-3 w-12 text-center" scope="col">
                  <input
                    checked={allSelected}
                    onChange={(e) => onSelectAllDocuments(e.target.checked)}
                    className="w-4 h-4 rounded bg-surface-elevated border-border-glass text-indigo-600 cursor-pointer"
                    type="checkbox"
                  />
                </th>
                <th className="py-3.5 px-4 font-semibold" scope="col">Name</th>
                <th className="py-3.5 px-4 font-semibold" scope="col">Type</th>
                <th className="py-3.5 px-4 font-semibold" scope="col">Size</th>
                <th className="py-3.5 px-4 font-semibold" scope="col">Status</th>
                <th className="py-3.5 pr-6 pl-4 text-right font-semibold" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-glass font-body-sm text-body-sm text-on-surface">
              {filteredDocs.length > 0 ? (
                filteredDocs.map((doc) => {
                  const isChecked = selectedDocumentIds.includes(doc.id);
                  const isPdf = doc.filename.toLowerCase().endsWith(".pdf");
                  const isIndexed = ingestion?.indexed_document_ids.includes(doc.id) ?? true;
                  const sizeKB = (doc.size / 1024).toFixed(1);

                  return (
                    <tr
                      key={doc.id}
                      className={`transition-colors group ${
                        isChecked ? "bg-indigo-950/20" : "hover:bg-surface-base/50"
                      }`}
                    >
                      <td className="py-4 pl-6 pr-3 text-center">
                        <input
                          checked={isChecked}
                          onChange={() => onToggleDocument(doc.id)}
                          className="w-4 h-4 rounded bg-surface-elevated border-border-glass text-indigo-600 cursor-pointer"
                          type="checkbox"
                        />
                      </td>
                      <td className="py-4 px-4 min-w-[260px]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 shadow-sm">
                            <span className="material-symbols-outlined text-[20px]">
                              {isPdf ? "picture_as_pdf" : "description"}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-title-md text-title-md text-text-crisp-white font-semibold truncate group-hover:text-indigo-400 transition-colors">
                              {doc.filename}
                            </span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                              <span>Source</span>
                              <span>•</span>
                              <span className="text-indigo-400">
                                {isIndexed ? "AI Indexed" : "Pending Ingestion"}
                              </span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold bg-surface-base border border-border-glass text-on-surface-variant uppercase">
                          {doc.file_type || (isPdf ? "PDF" : "TXT")}
                        </span>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap text-on-surface-variant">
                        {Number(sizeKB) > 1024 ? `${(Number(sizeKB) / 1024).toFixed(1)} MB` : `${sizeKB} KB`}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-medium bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {isIndexed ? "Processed" : "Pending"}
                        </span>
                      </td>
                      <td className="py-4 pr-6 pl-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <a
                            href={documentSourceUrl(doc.collection_id, doc.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-base hover:text-text-crisp-white transition-colors"
                            title="Quick Read"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                // Prototype fallback sample rows if collection empty
                <tr className="hover:bg-surface-base/50 transition-colors">
                  <td colSpan={6} className="py-8 text-center text-on-surface-variant">
                    No documents found in this collection. Click &quot;Upload New&quot; to add documents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provider Keys Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-border-glass rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-border-glass mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-400 text-[24px]">tune</span>
                <h3 className="font-headline-sm text-headline-sm text-text-crisp-white font-bold">
                  Pro Engine API Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-on-surface-variant hover:text-text-crisp-white p-1"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
              Enter your NVIDIA NIM API keys for deep reasoning, embeddings, and reranking. Keys are kept strictly in backend process memory.
            </p>

            <form onSubmit={handleSaveKeysSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-text-crisp-white font-semibold">
                  NVIDIA Reasoning &amp; Embedding Key
                </label>
                <input
                  value={keyReasoning}
                  onChange={(e) => setKeyReasoning(e.target.value)}
                  type="password"
                  placeholder={providers?.reasoning.configured ? "•••••••••••••••• (configured)" : "nvapi-..."}
                  className="px-3.5 py-2.5 bg-surface-base border border-border-glass rounded-xl text-text-crisp-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-text-crisp-white font-semibold">
                  NVIDIA Reranker Key
                </label>
                <input
                  value={keyReranker}
                  onChange={(e) => setKeyReranker(e.target.value)}
                  type="password"
                  placeholder={providers?.reranker.configured ? "•••••••••••••••• (configured)" : "nvapi-..."}
                  className="px-3.5 py-2.5 bg-surface-base border border-border-glass rounded-xl text-text-crisp-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {keyMessage && (
                <div className="p-3 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-400/30">
                  {keyMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-glass">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface-base text-on-surface hover:text-text-crisp-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKeys}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md transition-all"
                >
                  {savingKeys ? "Saving…" : "Save Keys"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
