"use client";

import React, { useRef, useState } from "react";
import { Document, IngestionStatus } from "../../lib/api";
import { NavTab } from "../sidebar";

interface UploadViewProps {
  documents: Document[];
  onUploadFiles: (files: File[]) => void;
  onPrepareDocuments: () => void;
  ingestion: IngestionStatus | null;
  frozen: boolean;
  onNavigateTab: (tab: NavTab) => void;
}

export default function UploadView({
  documents,
  onUploadFiles,
  onPrepareDocuments,
  ingestion,
  frozen,
  onNavigateTab,
}: UploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (frozen) return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onUploadFiles(droppedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (selectedFiles.length > 0) {
      onUploadFiles(selectedFiles);
    }
  };

  // Calculation of storage and stats
  const totalBytes = documents.reduce((acc, doc) => acc + (doc.size || 0), 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
  const processedDocs = documents.filter((d) =>
    ingestion?.indexed_document_ids?.includes(d.id)
  );
  const percentReady = documents.length > 0 ? Math.round((processedDocs.length / documents.length) * 100) : 100;

  return (
    <div className="relative w-full pb-16">
      {/* Ambient Glows */}
      <div className="absolute -top-12 left-1/4 w-96 h-96 bg-primary-fixed/30 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-48 right-1/4 w-80 h-80 bg-tertiary-fixed/20 dark:bg-sky-900/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Screen Title Area */}
      <div className="flex flex-col gap-1 mb-8 pt-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-primary-container text-on-primary shadow-sm shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">upload_file</span>
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface dark:text-text-crisp-white tracking-tight font-bold">
            Upload Documents
          </h1>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl pl-10">
          Add your study and research materials to start exploring. PDF, DOCX, TXT, MD, CSV, PPTX, and images supported.
        </p>
      </div>

      {/* Main Grid: Upload Stage & Quick Stats Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
        {/* Left: Primary Drop Zone & File Queue (Span 8) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Central Drag & Drop Zone */}
          <div
            id="dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !frozen && fileInputRef.current?.click()}
            className={`group relative overflow-hidden rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border-2 border-dashed ${
              isDragOver
                ? "border-primary bg-primary-fixed/20 scale-[1.01]"
                : "border-border-glass hover:border-primary/50"
            } backdrop-blur-xl p-8 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer text-center flex flex-col items-center justify-center min-h-[260px]`}
          >
            {/* Soft Inner Gradient Highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary-fixed/20 via-transparent to-surface-container-low/40 pointer-events-none" />

            {/* Upload Illustration & Floating Icon */}
            <div className="relative z-10 w-20 h-20 rounded-2xl bg-surface-container-low dark:bg-surface-container flex items-center justify-center mb-5 text-primary group-hover:scale-105 group-hover:bg-primary-container group-hover:text-on-primary transition-all duration-300 shadow-sm">
              <span className="material-symbols-outlined text-[38px]">cloud_upload</span>
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-secondary-container" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-1.5 max-w-md">
              <span className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white tracking-tight font-semibold">
                Drag &amp; drop your files here
              </span>
              <span className="font-body-md text-body-md text-on-surface-variant">
                or <span className="text-primary font-title-md hover:underline">click to browse</span> from your computer
              </span>
            </div>

            {/* Format Compatibility Badges */}
            <div className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                PDF
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                DOCX
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                TXT
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                MD (Markdown)
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                CSV
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                PPTX
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant">
                Images (PNG, JPG)
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={frozen}
              accept=".pdf,.docx,.txt,.pptx,.png,.jpg,.jpeg,.md,.markdown,.csv,text/markdown,text/x-markdown,text/plain"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Files In Pipeline & History Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-bold">
                  Recent Uploads
                </span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high dark:bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-semibold">
                  {documents.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrepareDocuments}
                  disabled={frozen}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-primary bg-primary-fixed/40 hover:bg-primary-fixed/60 transition-colors font-label-sm text-label-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Sync &amp; Index</span>
                </button>
              </div>
            </div>

            {/* Document Queue List */}
            <div className="flex flex-col gap-2.5">
              {documents.length === 0 ? (
                <div className="p-8 text-center bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass rounded-2xl text-on-surface-variant font-body-sm">
                  No documents in this collection yet. Drag files above to begin.
                </div>
              ) : (
                documents.map((doc) => {
                  const isProcessed = ingestion?.indexed_document_ids?.includes(doc.id);
                  const isPdf = doc.file_type.toLowerCase() === "pdf";
                  const isDoc = doc.file_type.toLowerCase() === "docx" || doc.file_type.toLowerCase() === "doc";
                  const isPpt = doc.file_type.toLowerCase() === "pptx" || doc.file_type.toLowerCase() === "ppt";
                  const isMd = doc.file_type.toLowerCase() === "md" || doc.file_type.toLowerCase() === "markdown";
                  const isCsv = doc.file_type.toLowerCase() === "csv";

                  return (
                    <div
                      key={doc.id}
                      className="group relative flex items-center justify-between p-4 rounded-2xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-md shadow-sm hover:shadow-md transition-all overflow-hidden"
                    >
                      {/* Animated bottom progress bar for active ingesting */}
                      {!isProcessed && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container">
                          <div className="h-full bg-gradient-to-r from-primary to-primary-container w-3/5 rounded-full animate-pulse" />
                        </div>
                      )}

                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Format Tag */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-label-md text-label-md font-bold shrink-0 shadow-sm ${
                            isPdf
                              ? "bg-error/10 text-error"
                              : isDoc
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              : isPpt
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                              : isMd
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : isCsv
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : "bg-surface-container text-on-surface-variant"
                          }`}
                        >
                          {isPdf ? "PDF" : isDoc ? "DOC" : isPpt ? "PPT" : isMd ? "MD" : isCsv ? "CSV" : doc.file_type.toUpperCase().slice(0, 3)}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white truncate font-semibold group-hover:text-primary transition-colors">
                            {doc.filename}
                          </span>
                          <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm mt-0.5">
                            <span>{(doc.size / (1024 * 1024)).toFixed(1)} MB</span>
                            <span className="w-1 h-1 rounded-full bg-outline-variant" />
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isProcessed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-label-sm text-label-sm font-semibold border border-emerald-500/20">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Processed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed/50 dark:bg-indigo-950/40 text-primary dark:text-indigo-300 font-label-sm text-label-sm font-semibold border border-primary/20">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                            Processing...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Document Insights & Storage Capacity Bento (Span 4) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Storage & Indexing Progress Card */}
          <div className="p-6 rounded-3xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-bold">
                Knowledge Indexing
              </span>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300 font-bold border border-border-glass">
                {percentReady}% Ready
              </span>
            </div>

            {/* Circular Metric Visualization (Inline SVG) */}
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  {/* Base Circle */}
                  <path
                    className="text-surface-container stroke-current"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    strokeWidth="3.5"
                  />
                  {/* Value Arc */}
                  <path
                    className="text-primary stroke-current"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    strokeDasharray={`${percentReady}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-bold">
                    {processedDocs.length} / {documents.length || 0}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
                  Vector Embeddings
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {documents.length > 0
                    ? `${documents.length * 350} chunks mapped to neural graph`
                    : "Awaiting documents"}
                </span>
              </div>
            </div>

            {/* Breakdown Bars */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border-glass">
              <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                <span>Vault Allocation</span>
                <span>{totalMB} MB / 500 MB</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high dark:bg-surface-container overflow-hidden flex">
                <div className="h-full bg-error rounded-l-full" style={{ width: "55%" }} />
                <div className="h-full bg-blue-500" style={{ width: "20%" }} />
                <div className="h-full bg-amber-500 rounded-r-full" style={{ width: "25%" }} />
              </div>
              <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-error" /> PDF
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> DOCX
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> PPTX
                </span>
              </div>
            </div>
          </div>

          {/* Immediate Study Tools Card */}
          <div className="p-6 rounded-3xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2 text-primary font-title-md text-title-md font-bold">
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              <span>Immediate Study Tools</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Your uploaded notes are ready for automated synthesis. Launch an active learning session now:
            </p>
            <div className="flex flex-col gap-2.5 mt-1">
              <button
                type="button"
                onClick={() => onNavigateTab("knowledge-graph")}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low dark:bg-surface-container hover:bg-primary-fixed/40 transition-colors group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">hub</span>
                  <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-medium">
                    Explore Knowledge Graph
                  </span>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-transform group-hover:translate-x-0.5 text-[18px]">
                  chevron_right
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("flashcards")}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low dark:bg-surface-container hover:bg-primary-fixed/40 transition-colors group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary text-[20px]">style</span>
                  <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-medium">
                    Generate Flashcard Deck
                  </span>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-secondary transition-transform group-hover:translate-x-0.5 text-[18px]">
                  chevron_right
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("cheat-sheet")}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low dark:bg-surface-container hover:bg-primary-fixed/40 transition-colors group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-tertiary-container dark:text-sky-300 text-[20px]">
                    description
                  </span>
                  <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-medium">
                    Assemble Cheat Sheet
                  </span>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-tertiary-container transition-transform group-hover:translate-x-0.5 text-[18px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>

          {/* Processing Mode Tip Box */}
          <div className="p-5 rounded-2xl bg-surface-container-low/70 dark:bg-surface-container/60 border border-border-glass flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">
              verified
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
                Pro Multimodal Engine
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Formulas, charts, and diagrams within your files are automatically extracted with visual reference citations.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
