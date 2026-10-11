"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Collection,
  Document,
  IngestionStatus,
  QueryResponse,
  sourceUrl,
} from "../../lib/api";
import { NavTab } from "../sidebar";

interface ChatViewProps {
  collection: Collection | undefined;
  documents: Document[];
  selectedIds: string[];
  onToggleDoc: (id: string) => void;
  onSelectAllDocs: (select: boolean) => void;
  ingestion: IngestionStatus | null;
  onNavigateTab: (tab: NavTab) => void;
  canQuery: boolean;
  querying: boolean;
  frozen: boolean;
  onAsk: (questionText: string) => void;
  result: QueryResponse | null;
  onClearChat: () => void;
  history: Array<{ question: string; result: QueryResponse; date: string }>;
  onSelectHistory: (item: { question: string; result: QueryResponse }) => void;
  onClearHistory: () => void;
}

export default function ChatView({
  collection,
  documents,
  selectedIds,
  onToggleDoc,
  onSelectAllDocs,
  ingestion,
  onNavigateTab,
  canQuery,
  querying,
  frozen,
  onAsk,
  result,
  onClearChat,
  history,
  onSelectHistory,
  onClearHistory,
}: ChatViewProps) {
  const [inputQuestion, setInputQuestion] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reasoningActive, setReasoningActive] = useState(true);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleScrollToEvidence = (id: string) => {
    setHighlightedEvidenceId(id);
    const el = document.getElementById(`evidence-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        setHighlightedEvidenceId((curr) => (curr === id ? null : curr));
      }, 4000);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedCount = selectedIds.length;
  const scopeLabel =
    selectedCount === 0
      ? "Select Documents"
      : selectedCount === documents.length
      ? `All Documents (${documents.length})`
      : `${selectedCount} Selected`;

  const handleSubmit = () => {
    if (!inputQuestion.trim() || querying || frozen || selectedCount === 0) return;
    onAsk(inputQuestion);
  };

  const selectQuickPill = (prompt: string) => {
    setInputQuestion(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Format generated answer into clean structured bullet points and nested lists with grouped, spaced citation pills
  const formatAnswerMarkdown = (rawAnswer: string, evidenceList: any[]) => {
    if (!rawAnswer) return "";

    // 1. Group and format adjacent citation markers on the same line: [evidence:ID1][evidence:ID2]
    let formatted = rawAnswer.replace(/(?:[ \t]*\[evidence:[A-Za-z0-9_-]+\][ \t]*)+/g, (match) => {
      const ids: string[] = [];
      const idRegex = /\[evidence:([A-Za-z0-9_-]+)\]/g;
      let m;
      while ((m = idRegex.exec(match)) !== null) {
        if (!ids.includes(m[1])) {
          ids.push(m[1]);
        }
      }
      if (ids.length === 0) return match;

      const links = ids.map((id) => {
        const index = evidenceList.findIndex((item) => item.evidence_id === id);
        const ev = index >= 0 ? evidenceList[index] : null;
        const pageLabel = ev?.page_number ? ` (p.${ev.page_number})` : "";
        return index < 0 ? `[Source ?](#evidence-${id})` : `[Source ${index + 1}${pageLabel}](#evidence-${id})`;
      });

      // Provide clean spacing before and between citation links
      return " " + links.join(" ") + " ";
    });

    // Clean up spacing around punctuation
    formatted = formatted
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/([.,;:!?])[ \t]*(\[Source [^\]]+\]\(#evidence-[^)]+\))/g, "$1 $2");

    // Helper: bold key term before colon if not already bolded ("Term: description" -> "**Term**: description")
    const formatLeadingKeyTerm = (content: string) => {
      return content.replace(/^([^:*#`\n]{2,40}):\s+(.*)$/, (_match, p1, p2) => {
        return `**${p1.trim()}**: ${p2}`;
      });
    };

    // Helper: split unbulleted prose with citations into individual cited sentences
    const splitCitedProse = (line: string) => {
      const citationEndRegex = /((?:\[Source [^\]]+\]\(#evidence-[^)]+\)[ \t]*)+[.,;:!?]?)\s+(?=[A-Z0-9"'“])/g;
      const segments: string[] = [];
      let lastIndex = 0;
      let match;
      while ((match = citationEndRegex.exec(line)) !== null) {
        const end = match.index + match[0].length;
        const segment = line.substring(lastIndex, end).trim();
        if (segment) segments.push(segment);
        lastIndex = end;
      }
      const remaining = line.substring(lastIndex).trim();
      if (remaining) segments.push(remaining);
      return segments.length > 0 ? segments : [line];
    };

    // 2. Parse lines and structure as bullet points and nested sub-bullets
    const lines = formatted.split("\n");
    const processedLines: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Preserve code fences
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        processedLines.push(line);
        continue;
      }
      if (inCodeBlock) {
        processedLines.push(line);
        continue;
      }

      if (!trimmed) {
        processedLines.push("");
        continue;
      }

      // Preserve markdown headers, tables, blockquotes
      if (trimmed.startsWith("#") || trimmed.startsWith("|") || trimmed.startsWith(">")) {
        processedLines.push(line);
        continue;
      }

      // Nested sub-bullets (starts with 2+ spaces or tab followed by -, *, +, or number)
      const nestedMatch = line.match(/^(\s{2,}|\t+)(?:[-*+]|\d+[.)])\s+(.*)$/);
      if (nestedMatch) {
        let content = nestedMatch[2].trim();
        content = formatLeadingKeyTerm(content);
        processedLines.push(`  - ${content}`);
        continue;
      }

      // Top-level bullet point (starts with -, *, +)
      const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
      if (bulletMatch) {
        let content = bulletMatch[1].trim();
        content = formatLeadingKeyTerm(content);
        processedLines.push(`- ${content}`);
        continue;
      }

      // Numbered list item converted to bullet
      const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
      if (numberedMatch) {
        let content = numberedMatch[1].trim();
        content = formatLeadingKeyTerm(content);
        processedLines.push(`- ${content}`);
        continue;
      }

      // Unbulleted prose: split into cited distinct sentences or format as bullet point
      const parts = splitCitedProse(line);
      for (const part of parts) {
        if (part.trim()) {
          const formattedPart = formatLeadingKeyTerm(part.trim());
          processedLines.push(`- ${formattedPart}`);
        }
      }
    }

    return processedLines.join("\n").replace(/\n{3,}/g, "\n\n");
  };

  const markdown = result ? formatAnswerMarkdown(result.answer, result.evidence) : "";

  const conflicts = result?.contradictions.filter((item) => item.status === "CONFLICT") ?? [];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col w-full pb-24">
      {/* Ambient Luminous Gradient Layers */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[760px] bg-gradient-to-tr from-primary-fixed/40 via-surface-variant/30 to-secondary-fixed/50 dark:from-indigo-900/30 dark:via-indigo-600/15 dark:to-violet-800/20 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 -right-32 w-[520px] h-[520px] bg-tertiary-fixed/30 dark:bg-sky-900/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute -bottom-16 left-12 w-[560px] h-[560px] bg-primary-fixed-dim/20 dark:bg-indigo-950/40 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Primary Workspace Content */}
      <div className="flex-1 flex flex-col items-center max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8">
        {/* Central Iridescent Orb Hero Element */}
        <div
          onClick={() => onNavigateTab("upload-documents")}
          className="relative group cursor-pointer mb-5 animate-orb-float"
        >
          {/* Outer Pulsing Glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary-container via-secondary to-tertiary dark:from-indigo-500 dark:via-indigo-600 dark:to-sky-400 blur-2xl opacity-40 dark:opacity-50 scale-110 animate-pulse transition-all duration-700 group-hover:scale-125 group-hover:opacity-75" />
          {/* 3D Luminous Orb Sphere */}
          <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-full p-[2px] shadow-[0_20px_50px_rgba(93,80,238,0.28)] dark:shadow-[0_20px_60px_rgba(99,102,241,0.45)] transition-transform duration-500 hover:rotate-6 hover:scale-105">
            <div className="w-full h-full rounded-full relative overflow-hidden bg-gradient-to-br from-[#c9b7ff] via-[#8598ff] to-[#40d2ff] dark:from-[#c9b7ff] dark:via-[#6366f1] dark:to-[#38bdf8]">
              {/* Inner Specular Refraction Highlights */}
              <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-white/70 blur-md mix-blend-overlay" />
              <div className="absolute top-3 left-6 w-12 h-8 rounded-full bg-white/80 blur-xs rotate-[-25deg]" />
              <div className="absolute bottom-2 right-4 w-20 h-20 rounded-full bg-secondary-container/40 dark:bg-indigo-950/50 blur-lg" />
              {/* Iridescent Surface Sheen */}
              <svg className="absolute inset-0 w-full h-full opacity-40 mix-blend-soft-light" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="orbGrad" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#7064f4" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#acedff" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" fill="url(#orbGrad)" r="50" />
              </svg>
            </div>
          </div>

          {/* Quick Context Micro-Badge Floating */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface-container-lowest/90 dark:bg-surface-elevated/90 dark:border dark:border-border-glass backdrop-blur-md px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-primary dark:bg-indigo-400 animate-ping animate-status-pulse" />
            <span className="font-label-sm text-label-sm text-primary dark:text-indigo-200 tracking-wide font-medium">
              {ingestion?.ready
                ? `${documents.length} Synced Docs`
                : documents.length > 0
                ? "Indexing Context..."
                : "Ready for Ingestion"}
            </span>
          </div>
        </div>

        {/* Greeting & Subtitle */}
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-8">
          <h1 className="font-display-lg text-display-lg text-on-surface dark:text-text-crisp-white tracking-tight">
            Welcome to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-container to-secondary dark:from-indigo-300 dark:via-indigo-400 dark:to-indigo-200">
              DocuNova
            </span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant font-normal leading-relaxed">
            Chat with your documents, explore insights, learn concepts, and more — all in one place.
          </p>
        </div>

        {/* Floating Glass Command Query Box */}
        <div className="w-full relative group">
          {/* Glow Underlay */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary-fixed via-surface-variant to-secondary-fixed dark:from-indigo-600/30 dark:via-violet-600/20 dark:to-sky-500/20 opacity-40 dark:opacity-60 blur-xl group-hover:opacity-75 transition-opacity duration-500" />

          {/* Glass Stage Container */}
          <div className="relative bg-surface-container-lowest/85 dark:bg-surface-elevated/85 border border-border-glass backdrop-blur-2xl rounded-3xl p-4 sm:p-5 shadow-[0_12px_40px_-10px_rgba(93,80,238,0.14)] dark:shadow-[0_12px_48px_-10px_rgba(0,0,0,0.7)] transition-all duration-300">
            {/* Textarea Input Area */}
            <div className="relative w-full">
              <textarea
                ref={textareaRef}
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={frozen}
                rows={3}
                placeholder="Ask a question about your documents..."
                className="w-full bg-transparent resize-none border-0 focus:outline-none focus:ring-0 font-body-lg text-body-lg text-on-surface dark:text-text-crisp-white placeholder:text-on-surface-variant/60 dark:placeholder:text-slate-500 placeholder:font-normal p-2 leading-relaxed min-h-[72px] max-h-[220px] overflow-y-auto"
              />
            </div>

            {/* Controls Bar & Dynamic Dropdowns */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-border-glass">
              {/* Left Controls: Attachment, Scope Selector, Reasoning Switch */}
              <div className="flex items-center gap-2">
                {/* Attachment Button */}
                <button
                  type="button"
                  onClick={() => onNavigateTab("upload-documents")}
                  title="Upload / Attach files"
                  className="w-9 h-9 rounded-xl bg-surface-container-low dark:bg-surface-container border border-border-glass hover:bg-surface-container text-on-surface-variant hover:text-primary transition-all flex items-center justify-center group/btn active:scale-95"
                >
                  <span className="material-symbols-outlined text-[20px] transition-transform group-hover/btn:rotate-12">
                    attach_file
                  </span>
                </button>

                {/* Document Selection Dropdown Trigger */}
                <div className="relative z-40" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="h-9 px-3.5 rounded-xl bg-surface-container-low dark:bg-surface-container border border-border-glass hover:bg-surface-container text-on-surface flex items-center gap-2 font-label-md text-label-md transition-colors active:scale-95"
                  >
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      article
                    </span>
                    <span className="truncate max-w-[150px]">{scopeLabel}</span>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                      expand_more
                    </span>
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 bottom-12 w-84 bg-white dark:bg-[#181826] border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-3.5 z-[100] animate-in fade-in zoom-in-95 duration-150 max-h-80 flex flex-col">
                      <div className="pb-2.5 border-b border-slate-100 dark:border-white/10 text-label-sm font-label-sm text-on-surface-variant flex items-center justify-between">
                        <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">Select Documents</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectAllDocs(true)}
                            className="text-primary hover:underline font-semibold text-xs"
                          >
                            Select All
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => onSelectAllDocs(false)}
                            className="text-on-surface-variant hover:text-error hover:underline font-semibold text-xs"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      <div className="overflow-y-auto max-h-60 mt-2 flex flex-col gap-1 pr-1">
                        {documents.length === 0 ? (
                          <div className="px-3 py-3 text-on-surface-variant font-body-sm text-center">
                            No documents uploaded yet
                          </div>
                        ) : (
                          documents.map((doc) => {
                            const isSelected = selectedIds.includes(doc.id);
                            return (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => onToggleDoc(doc.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors font-body-sm text-body-sm ${
                                  isSelected
                                    ? "bg-indigo-600/15 text-indigo-400 font-semibold"
                                    : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "border-border-glass bg-surface-base"
                                    }`}
                                  >
                                    {isSelected && (
                                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                                    )}
                                  </span>
                                  <span className="truncate">{doc.filename}</span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Deep Reasoning Switch Toggle */}
                <div className="flex items-center gap-2 px-3 h-9 rounded-xl bg-surface-container-low dark:bg-surface-container border border-border-glass">
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    psychology
                  </span>
                  <span className="font-label-md text-label-md text-on-surface hidden sm:inline">
                    Reasoning
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reasoningActive}
                    onClick={() => setReasoningActive(!reasoningActive)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      reasoningActive
                        ? "bg-secondary-container dark:bg-indigo-600"
                        : "bg-surface-container-highest dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out mt-0.5 ml-0.5 ${
                        reasoningActive ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Right Action: Send Arrow Button */}
              <div className="flex items-center gap-2">
                <span className="hidden md:inline font-label-sm text-label-sm text-on-surface-variant font-medium">
                  ⌘ + Return
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputQuestion.trim() || querying || frozen || selectedCount === 0}
                  aria-label="Send Query"
                  className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-primary-container hover:from-primary-container hover:to-secondary text-on-primary flex items-center justify-center shadow-[0_6px_20px_rgba(93,80,238,0.35)] hover:shadow-[0_8px_24px_rgba(93,80,238,0.5)] hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
                >
                  <span className="material-symbols-outlined text-[20px] ml-0.5">near_me</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Prompt Suggestion Pills */}
        <div className="w-full flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 mt-6">
          <button
            type="button"
            onClick={() => selectQuickPill("Summarize this document highlighting core takeaways and methodologies")}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-md shadow-sm hover:shadow-md hover:bg-surface-container-low transition-all duration-200 text-on-surface pill-hover-lift"
          >
            <span className="text-primary font-headline-sm text-headline-sm leading-none transition-transform group-hover:scale-125">
              ✦
            </span>
            <span className="font-label-md text-label-md text-on-surface group-hover:text-primary transition-colors">
              Summarize this document
            </span>
          </button>
          <div className="hidden sm:block w-px h-5 bg-border-glass" />
          <button
            type="button"
            onClick={() => selectQuickPill("Compare key arguments, formulas, and conclusions across all uploaded files")}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-md shadow-sm hover:shadow-md hover:bg-surface-container-low transition-all duration-200 text-on-surface pill-hover-lift"
          >
            <span className="text-secondary font-headline-sm text-headline-sm leading-none transition-transform group-hover:scale-125">
              ✦
            </span>
            <span className="font-label-md text-label-md text-on-surface group-hover:text-secondary transition-colors">
              Compare multiple documents
            </span>
          </button>
          <div className="hidden sm:block w-px h-5 bg-border-glass" />
          <button
            type="button"
            onClick={() => selectQuickPill("Explain this topic in simple terms with intuitive real-world analogies")}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-md shadow-sm hover:shadow-md hover:bg-surface-container-low transition-all duration-200 text-on-surface pill-hover-lift"
          >
            <span className="text-tertiary-container dark:text-sky-300 font-headline-sm text-headline-sm leading-none transition-transform group-hover:scale-125">
              ✦
            </span>
            <span className="font-label-md text-label-md text-on-surface group-hover:text-tertiary-container dark:group-hover:text-sky-300 transition-colors">
              Explain in simple terms
            </span>
          </button>
        </div>

        {/* Querying State Progress Banner */}
        {querying && (
          <div className="w-full mt-8 p-5 rounded-2xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass shadow-lg flex items-center gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px] animate-spin">refresh</span>
            </div>
            <div className="flex flex-col">
              <span className="font-title-md text-title-md text-on-surface font-semibold">
                Synthesizing Grounded Answer
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Vector retrieval → Reranking evidence → Neural reasoning → Fact verification
              </span>
            </div>
          </div>
        )}

        {/* Structured Answer Results Panel */}
        {result && (
          <div className="w-full mt-8 flex flex-col gap-5">
            <div className="relative overflow-hidden bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-xl">
              {/* Answer Header Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-border-glass">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-title-md text-title-md text-on-surface font-bold">
                    DocuNova Answer
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-label-sm text-label-sm font-semibold ml-2">
                    {result.verified ? "VERIFIED CLAIM" : result.answerability}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(result.answer)}
                    className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                    title="Copy Answer"
                  >
                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearChat}
                    className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors"
                    title="Clear Result"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              {/* Rendered Answer Body with custom Markdown formatting & citation pills */}
              <div className="py-6 font-body-lg text-body-lg text-on-surface leading-relaxed max-w-none">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith("#evidence-")) {
                        const evidenceId = href.replace("#evidence-", "");
                        const evItem = result?.evidence.find((e) => e.evidence_id === evidenceId);
                        const isHighlighted = highlightedEvidenceId === evidenceId;
                        return (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              handleScrollToEvidence(evidenceId);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleScrollToEvidence(evidenceId);
                              }
                            }}
                            className={`inline-flex items-center gap-1 mx-1 my-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer select-none align-baseline shadow-xs ${
                              isHighlighted
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-105 ring-2 ring-indigo-400"
                                : "bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 dark:text-indigo-300 dark:border-indigo-500/30 hover:scale-105 hover:shadow-sm"
                            }`}
                            title={
                              evItem
                                ? `${evItem.filename}${evItem.page_number ? ` (Page ${evItem.page_number})` : ""}: ${evItem.source_reference || "Evidence source"}`
                                : "Jump to source evidence"
                            }
                          >
                            <span className="material-symbols-outlined text-[13px] opacity-75">
                              menu_book
                            </span>
                            <span className="font-mono tracking-tight">{children}</span>
                          </span>
                        );
                      }
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                        >
                          {children}
                          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        </a>
                      );
                    },
                    p: ({ children }) => (
                      <p className="mb-3 leading-relaxed font-body-md text-on-surface dark:text-slate-100 last:mb-0">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-3 space-y-2 pl-6 list-disc marker:text-indigo-500 dark:marker:text-indigo-400 text-on-surface dark:text-slate-100 [&_ul]:my-1.5 [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:list-[circle] [&_ul_li]:text-on-surface/90 dark:[&_ul_li]:text-slate-200">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-3 space-y-2 pl-6 list-decimal marker:text-indigo-500 dark:marker:text-indigo-400 text-on-surface dark:text-slate-100 font-semibold [&_ol]:my-1.5 [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:my-1.5 [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:list-[circle]">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed font-body-md font-normal text-on-surface dark:text-slate-100">
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-bold text-on-surface dark:text-white">
                        {children}
                      </strong>
                    ),
                    code: ({ children }) => (
                      <code className="px-1.5 py-0.5 rounded-md bg-surface-container-high dark:bg-slate-800 text-primary dark:text-indigo-300 font-mono text-xs border border-border-glass">
                        {children}
                      </code>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold font-headline-md text-on-surface mt-6 mb-3 border-b border-border-glass pb-1">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-bold font-headline-sm text-on-surface mt-5 mb-2.5">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold font-title-lg text-on-surface mt-4 mb-2">
                        {children}
                      </h3>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-indigo-500/60 bg-indigo-500/5 dark:bg-indigo-500/10 px-4 py-2 my-3 rounded-r-xl italic text-on-surface-variant font-body-md">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 rounded-xl border border-border-glass">
                        <table className="w-full text-left border-collapse text-sm">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-2.5 bg-surface-container-low dark:bg-surface-elevated font-semibold text-on-surface border-b border-border-glass">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2.5 border-b border-border-glass/60 text-on-surface-variant">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>

              {/* Citations & Evidence Trace Strip */}
              <div className="pt-4 border-t border-border-glass flex flex-wrap items-center justify-between gap-3 text-on-surface-variant font-label-sm text-label-sm">
                <div className="flex items-center gap-3">
                  <span>{result.citations.length} Citations</span>
                  <span>•</span>
                  <span>{result.evidence.length} Evidences Checked</span>
                  <span>•</span>
                  <span className="capitalize">{result.response_mode} Mode</span>
                </div>
                <div className="flex items-center gap-2">
                  {result.guardrails_invoked.map((g) => (
                    <span key={g} className="px-2 py-0.5 rounded-md bg-surface-container-low border border-border-glass text-xs">
                      {g}
                    </span>
                  ))}
                </div>
              </div>

              {/* Evidence Passages Dropdown Shelf */}
              {result.evidence.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border-glass flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                      Source Evidence Citations ({result.evidence.length})
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Click any citation pill above or source card below to jump to evidence
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    {result.evidence.map((item, idx) => {
                      const isHighlighted = highlightedEvidenceId === item.evidence_id;
                      return (
                        <div
                          key={item.evidence_id}
                          id={`evidence-${item.evidence_id}`}
                          className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-3 ${
                            isHighlighted
                              ? "bg-indigo-500/15 dark:bg-indigo-500/25 border-indigo-500 shadow-xl ring-2 ring-indigo-500/60 scale-[1.01]"
                              : "bg-surface-container-low dark:bg-surface-container/60 border-border-glass hover:border-indigo-500/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <span className={`px-2.5 py-0.5 rounded-lg font-bold text-xs flex items-center gap-1 ${
                                isHighlighted
                                  ? "bg-indigo-600 text-white shadow-sm"
                                  : "bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300"
                              }`}>
                                <span className="material-symbols-outlined text-[14px]">menu_book</span>
                                <span>Source {idx + 1}</span>
                              </span>
                              <span className="font-title-md text-title-md text-on-surface font-semibold truncate" title={item.filename}>
                                {item.filename}
                              </span>
                            </div>
                            <span className="font-label-sm text-label-sm text-primary font-mono shrink-0">
                              Score: {item.retrieval_score.toFixed(2)}
                            </span>
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3 italic bg-surface-base/50 dark:bg-surface-elevated/40 p-2.5 rounded-xl border border-border-glass/40">
                            "{item.text || "Direct document passage citation."}"
                          </p>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-border-glass/40">
                            <span className="text-on-surface-variant font-medium">
                              {item.page_number ? `Page ${item.page_number}` : item.source_reference}
                            </span>
                            <a
                              href={sourceUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-semibold flex items-center gap-0.5"
                            >
                              View Source ↗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Research Workspace Live Cards (Bottom Shelf) */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 pt-6">
          {/* Card 1: Recently Uploaded Context */}
          <div
            onClick={() => onNavigateTab("topic-tree-and-summary")}
            className="relative overflow-hidden bg-surface-container-lowest/70 dark:bg-surface-elevated/70 border border-border-glass backdrop-blur-xl rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between card-hover-lift cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">description</span>
              </div>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                Active
              </span>
            </div>
            <div className="mt-4">
              <h2 className="font-title-md text-title-md text-on-surface truncate font-semibold">
                {documents[0]?.filename ?? "Document Vault"}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                {documents.length} files synced • Hierarchical summary ready
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-primary font-label-md text-label-md group-hover:translate-x-1 transition-transform">
              <span>Explore Tree & Summary</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>

          {/* Card 2: Interactive Study Vector (Knowledge Graph snapshot) */}
          <div
            onClick={() => onNavigateTab("knowledge-graph")}
            className="relative overflow-hidden bg-surface-container-lowest/70 dark:bg-surface-elevated/70 border border-border-glass backdrop-blur-xl rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between card-hover-lift cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl bg-secondary-fixed dark:bg-purple-500/20 text-secondary dark:text-purple-300 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">hub</span>
              </div>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-fixed/50 dark:bg-purple-900/40 text-secondary dark:text-purple-200">
                Graph Ready
              </span>
            </div>
            <div className="mt-4">
              <h2 className="font-title-md text-title-md text-on-surface truncate font-semibold">
                Neural Concept Graph
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Multi-entity relations • Latent concept clusters
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-secondary font-label-md text-label-md group-hover:translate-x-1 transition-transform">
              <span>Open Spatial View</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>

          {/* Card 3: Retention & Self-Test Readiness */}
          <div
            onClick={() => onNavigateTab("flashcards")}
            className="relative overflow-hidden bg-surface-container-lowest/70 dark:bg-surface-elevated/70 border border-border-glass backdrop-blur-xl rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between card-hover-lift cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl bg-tertiary-fixed dark:bg-sky-500/20 text-tertiary dark:text-sky-300 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">style</span>
              </div>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                Smart Recall
              </span>
            </div>
            <div className="mt-4">
              <h2 className="font-title-md text-title-md text-on-surface truncate font-semibold">
                Generated Flashcard Set
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Spaced repetition • Confidence scoring
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-tertiary-container dark:text-sky-300 font-label-md text-label-md group-hover:translate-x-1 transition-transform">
              <span>Start Review Session</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="w-full flex items-center justify-between mt-8 text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-status-pulse" />
            <span className="font-label-sm text-label-sm">
              {documents.length} documents synced in context
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-label-sm text-label-sm hover:text-primary cursor-pointer transition-colors hidden sm:inline">
              Shortcuts: ⌘ + Return Ask • Tab Focus
            </span>
            <span className="font-label-sm text-label-sm font-semibold">
              DocuNova Engine v2.4
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
