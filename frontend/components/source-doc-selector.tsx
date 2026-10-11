"use client";

import React, { useState, useRef, useEffect } from "react";
import { Document } from "../lib/api";

interface SourceDocSelectorProps {
  documents: Document[];
  // Multiple document selection
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  // Single document selection (backward-compatible)
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  topic?: string;
  onTopicChange?: (topic: string) => void;
  topicPlaceholder?: string;
  onGenerate?: () => void;
  generateLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  extraControls?: React.ReactNode;
  allowAll?: boolean;
}

export default function SourceDocSelector({
  documents,
  selectedDocIds,
  onSelectDocIds,
  selectedDocId,
  onSelectDocId,
  topic,
  onTopicChange,
  topicPlaceholder = "Focus topic (optional)...",
  onGenerate,
  generateLabel = "Generate",
  loading = false,
  disabled = false,
  extraControls,
  allowAll = true,
}: SourceDocSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute effective selected IDs
  const isMulti = onSelectDocIds !== undefined;
  const currentSelectedIds: string[] = isMulti
    ? selectedDocIds ?? documents.map((d) => d.id)
    : selectedDocId
    ? [selectedDocId]
    : documents.map((d) => d.id);

  const isAllSelected =
    documents.length > 0 && currentSelectedIds.length === documents.length;

  const handleToggle = (id: string) => {
    if (isMulti && onSelectDocIds) {
      if (currentSelectedIds.includes(id)) {
        onSelectDocIds(currentSelectedIds.filter((item) => item !== id));
      } else {
        onSelectDocIds([...currentSelectedIds, id]);
      }
    } else if (onSelectDocId) {
      if (selectedDocId === id) {
        onSelectDocId("");
      } else {
        onSelectDocId(id);
      }
      setIsOpen(false);
    }
  };

  const handleSelectAll = (select: boolean) => {
    if (isMulti && onSelectDocIds) {
      onSelectDocIds(select ? documents.map((d) => d.id) : []);
    } else if (onSelectDocId) {
      onSelectDocId(select ? "" : (documents[0]?.id ?? ""));
    }
  };

  const label = (() => {
    if (documents.length === 0) return "No documents";
    if (!isMulti && selectedDocId) {
      const doc = documents.find((d) => d.id === selectedDocId);
      return doc ? doc.filename : "1 Document Selected";
    }
    if (currentSelectedIds.length === 0) return "0 Selected (Select source)";
    if (isAllSelected) return `All Documents (${documents.length})`;
    if (currentSelectedIds.length === 1) {
      const doc = documents.find((d) => d.id === currentSelectedIds[0]);
      return doc ? doc.filename : "1 Document Selected";
    }
    return `${currentSelectedIds.length} Documents Selected`;
  })();

  const canGenerate =
    documents.length > 0 && currentSelectedIds.length > 0 && !loading && !disabled;

  return (
    <div className="w-full bg-surface-elevated/90 border border-border-glass backdrop-blur-xl rounded-2xl p-4 shadow-md mb-6 transition-colors relative z-30">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Document Picker and Topic Input */}
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Document Multi-Select Dropdown */}
          <div className="flex flex-col gap-1 min-w-[260px] flex-1 sm:flex-initial relative z-50" ref={dropdownRef}>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-indigo-400">description</span>
                Source Documents
              </span>
              <span className="text-[11px] text-indigo-400 font-normal">
                {currentSelectedIds.length}/{documents.length}
              </span>
            </label>

            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              disabled={documents.length === 0 || loading}
              className="w-full flex items-center justify-between pl-3 pr-3 py-2 bg-surface-base dark:bg-slate-900 border border-border-glass rounded-xl text-on-surface dark:text-slate-100 font-label-md text-label-md focus:outline-none focus:border-indigo-500/60 transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <span className="truncate max-w-[200px]">{label}</span>
              <span className={`material-symbols-outlined text-[18px] text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
              <div className="absolute left-0 top-full mt-2 w-84 bg-white dark:bg-[#181826] border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-3.5 z-[100] animate-in fade-in zoom-in-95 duration-150 max-h-80 flex flex-col">
                <div className="pb-2.5 border-b border-slate-100 dark:border-white/10 text-label-sm font-label-sm text-on-surface-variant flex items-center justify-between">
                  <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">Select Sources</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAll(true)}
                      className="text-primary hover:underline font-semibold text-xs"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAll(false)}
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
                      const isSelected = currentSelectedIds.includes(doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleToggle(doc.id)}
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
                          <span className="text-[11px] text-on-surface-variant shrink-0 ml-2">
                            {(doc.size / (1024 * 1024)).toFixed(1)}MB
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Optional Topic Field */}
          {onTopicChange !== undefined && (
            <div className="flex flex-col gap-1 min-w-[240px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-indigo-400">auto_awesome</span>
                Topic / Concept Focus
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={topic ?? ""}
                  onChange={(e) => onTopicChange(e.target.value)}
                  placeholder={topicPlaceholder}
                  disabled={documents.length === 0 || loading}
                  className="w-full pl-3 pr-3 py-2 bg-surface-base dark:bg-slate-900 border border-border-glass rounded-xl text-on-surface dark:text-slate-100 font-body-sm text-body-sm placeholder:text-on-surface-variant/60 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 transition-colors disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Any extra filter controls (difficulty, level, count, format) */}
          {extraControls}
        </div>

        {/* Right: Generate Action Button */}
        {onGenerate && (
          <div className="flex items-end self-end lg:self-center mt-2 lg:mt-0 shrink-0">
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-title-md text-title-md shadow-[0_0_15px_rgba(99,102,241,0.35)] transition-all active:scale-[0.98]"
            >
              <span className={`material-symbols-outlined text-[19px] ${loading ? "animate-spin" : ""}`}>
                {loading ? "refresh" : "auto_awesome"}
              </span>
              <span>{loading ? "Generating..." : generateLabel}</span>
            </button>
          </div>
        )}
      </div>

      {/* Selected Sources Pills & Summary Strip */}
      {documents.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-border-glass flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-emerald-400">verified</span>
            <span>
              Generating exclusively from <strong>{currentSelectedIds.length}</strong> of {documents.length} document(s)
            </span>
            {currentSelectedIds.length === 0 && (
              <span className="text-error font-semibold ml-1">
                (Please select at least 1 document)
              </span>
            )}
          </div>
          {!isAllSelected && currentSelectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="text-indigo-400 hover:underline font-medium"
            >
              Select All Documents
            </button>
          )}
        </div>
      )}
    </div>
  );
}
