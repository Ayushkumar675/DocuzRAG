"use client";

import { useState } from "react";
import SourceDocSelector from "../source-doc-selector";
import { Document, LearningArtifact, LearningEvidence, LearningGenerateInput, learningSourceUrl } from "../../lib/api";

interface CheatSheetViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  artifact: LearningArtifact | null;
  loading: boolean;
  ready: boolean;
  onGenerate: (format: LearningGenerateInput["format"], topic?: string, regenerate?: boolean, selectedDocIds?: string[]) => void;
  onNavigateUpload?: () => void;
}

const formatsList: Array<{
  id: LearningGenerateInput["format"];
  label: string;
  icon: string;
}> = [
  { id: "quick_revision", label: "Quick Revision", icon: "bolt" },
  { id: "formula_sheet", label: "Formulas", icon: "functions" },
  { id: "key_concepts", label: "Key Concepts", icon: "lightbulb" },
  { id: "comparison_table", label: "Comparisons", icon: "compare_arrows" },
  { id: "exam_outline", label: "Exam Preparation", icon: "school" },
  { id: "last_minute", label: "Last-Minute Notes", icon: "tune" },
];

export default function CheatSheetView({
  collectionId,
  documents,
  selectedDocId,
  onSelectDocId,
  selectedDocIds,
  onSelectDocIds,
  artifact,
  loading,
  ready,
  onGenerate,
  onNavigateUpload,
}: CheatSheetViewProps) {
  const [selectedFormat, setSelectedFormat] = useState<LearningGenerateInput["format"]>("quick_revision");
  const [topic, setTopic] = useState("");
  const [copied, setCopied] = useState(false);

  const sections = artifact?.content?.sections ?? [];
  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  const handleCopyAll = () => {
    if (!sections.length) return;
    let text = `${artifact?.content?.title || "Cheat Sheet"}\n\n`;
    sections.forEach((s: any) => {
      text += `## ${s.heading}\n${s.content}\n\n`;
    });
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col w-full relative pb-16">
      {/* Ambient background glows */}
      <div className="absolute -top-10 left-1/4 w-96 h-64 bg-indigo-600/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-20 right-1/6 w-80 h-72 bg-blue-600/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Page Header Section */}
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-400 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
            Synthesized Deck
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Compact Reference Material
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-text-crisp-white tracking-tight font-bold">
          Cheat Sheet
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Generate concise revision notes, key formulas, and core comparative matrices grounded in your uploaded documents.
        </p>
      </div>

      {/* Source Document & Format Selector */}
      <SourceDocSelector
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDocId={onSelectDocId}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={onSelectDocIds}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (optional, e.g. Algorithms, Loss Functions)..."
        onGenerate={() => onGenerate(selectedFormat, topic.trim(), Boolean(artifact), selectedDocIds)}
        generateLabel={artifact ? "Regenerate Sheet" : "Generate Cheat Sheet"}
        loading={loading}
        disabled={!ready}
        extraControls={
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-indigo-400">tune</span>
              Format
            </label>
            <div className="relative">
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as any)}
                disabled={documents.length === 0 || loading}
                className="w-full appearance-none pl-3 pr-8 py-2 bg-surface-base dark:bg-slate-900 border border-border-glass rounded-xl text-on-surface dark:text-slate-100 font-label-md text-label-md focus:outline-none focus:border-indigo-500/60 cursor-pointer disabled:opacity-50"
              >
                {formatsList.map((f) => (
                  <option key={f.id} value={f.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                expand_more
              </span>
            </div>
          </div>
        }
      />

      {/* Workspace Main Area */}
      {loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-indigo-400 animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Distilling document content into {formatsList.find((f) => f.id === selectedFormat)?.label}...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Extracting core lemmas, equations, and verified citations
          </span>
        </div>
      ) : !artifact ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">description</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Cheat Sheet Generated Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload your technical documents to generate compact cheat sheets."
                : "Select a source document and a synthesis format above, then click Generate Cheat Sheet."}
            </p>
          </div>
          {documents.length === 0 && onNavigateUpload ? (
            <button
              type="button"
              onClick={onNavigateUpload}
              className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-title-md text-title-md shadow-md transition-all"
            >
              Upload Documents →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onGenerate(selectedFormat, topic.trim(), false)}
              disabled={!ready || documents.length === 0}
              className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-title-md text-title-md shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              Generate Cheat Sheet →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Format Switcher Tabs (3 Cols) */}
          <aside className="lg:col-span-3 flex flex-col gap-4">
            <div className="p-4 rounded-2xl bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-lg flex flex-col">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold pb-3 border-b border-border-glass mb-2">
                Format Switcher
              </span>
              <div className="flex flex-col gap-1.5">
                {formatsList.map((f) => {
                  const isActive = selectedFormat === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        setSelectedFormat(f.id);
                        onGenerate(f.id, topic.trim(), false);
                      }}
                      type="button"
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-title-md text-title-md transition-all text-left ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm border border-indigo-400/40"
                          : "text-on-surface-variant hover:bg-surface-base hover:text-text-crisp-white border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px]">{f.icon}</span>
                        <span>{f.label}</span>
                      </div>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Document Context Card */}
            {selectedDoc && (
              <div className="p-4 rounded-2xl bg-surface-elevated/90 border border-border-glass shadow-lg flex flex-col gap-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                  Active Document Source
                </span>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-base border border-border-glass">
                  <span className="material-symbols-outlined text-rose-400 text-[22px]">picture_as_pdf</span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-title-md text-title-md text-text-crisp-white truncate font-semibold">
                      {selectedDoc.filename}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {(selectedDoc.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Right Column: Main Cheat Sheet Content Document (9 Cols) */}
          <main className="lg:col-span-9 flex flex-col gap-4">
            <article className="p-6 md:p-8 rounded-3xl bg-surface-elevated/90 border border-border-glass backdrop-blur-2xl shadow-2xl flex flex-col gap-6 relative overflow-hidden">
              {/* Sheet Header Bar */}
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-glass">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-indigo-400 font-bold tracking-wide uppercase mb-1">
                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                    <span>{formatsList.find((f) => f.id === selectedFormat)?.label || "Notes"}</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-text-crisp-white font-bold tracking-tight">
                    {artifact.content?.title || "Synthesized Cheat Sheet"}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-surface-base border border-border-glass text-on-surface-variant hover:text-text-crisp-white text-sm flex items-center gap-1"
                    title="Print"
                  >
                    <span className="material-symbols-outlined text-[17px]">print</span>
                    <span>Print</span>
                  </button>
                  <button
                    onClick={handleCopyAll}
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-surface-base border border-border-glass text-on-surface-variant hover:text-text-crisp-white text-sm flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      {copied ? "check" : "content_copy"}
                    </span>
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
              </header>

              {/* Real Sections */}
              {sections.length > 0 ? (
                sections.map((section: any, idx: number) => (
                  <section key={idx} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 pb-1">
                      <span className="material-symbols-outlined text-indigo-400 text-[20px]">lightbulb</span>
                      <h3 className="font-headline-sm text-headline-sm text-text-crisp-white font-bold">
                        {section.heading}
                      </h3>
                    </div>
                    <div className="p-5 rounded-2xl bg-surface-base border border-border-glass shadow-sm flex flex-col gap-2">
                      <div className="text-on-surface leading-relaxed whitespace-pre-line font-body-md">
                        {section.content}
                      </div>
                    </div>
                  </section>
                ))
              ) : (
                <div className="p-8 text-center text-on-surface-variant">
                  No section data available in this sheet. Try regenerating or choosing another format.
                </div>
              )}

              {/* Grounded Citations Footer */}
              {artifact.evidence && artifact.evidence.length > 0 && (
                <footer className="pt-4 border-t border-border-glass flex flex-wrap gap-2 items-center">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                    Citations:
                  </span>
                  {artifact.evidence.map((item: LearningEvidence, idx: number) => (
                    <a
                      key={item.evidence_id}
                      href={learningSourceUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-base border border-border-glass text-indigo-400 text-xs hover:border-indigo-500/50"
                    >
                      <span className="material-symbols-outlined text-[14px]">link</span>
                      <span>
                        {item.filename} {item.page_number ? `• p.${item.page_number}` : `• Ref ${idx + 1}`}
                      </span>
                    </a>
                  ))}
                </footer>
              )}
            </article>
          </main>
        </div>
      )}
    </div>
  );
}
