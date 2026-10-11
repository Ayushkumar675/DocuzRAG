"use client";

import React from "react";

export type NavTab =
  | "chat"
  | "upload-documents"
  | "knowledge-graph"
  | "flashcards"
  | "quizzes"
  | "topic-tree-and-summary"
  | "cheat-sheet"
  | "teach-me-mode"
  | "library"
  | "collections"
  | "history"
  | "settings";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  documentCount: number;
  collectionName?: string;
  isReady?: boolean;
}

export default function Sidebar({
  activeTab,
  onSelectTab,
  documentCount,
  collectionName = "Default",
  isReady = false,
}: SidebarProps) {
  const workspaceLinks: Array<{ id: NavTab; label: string; icon: string }> = [
    { id: "chat", label: "Chat", icon: "chat_bubble" },
    { id: "upload-documents", label: "Upload Documents", icon: "upload_file" },
    { id: "knowledge-graph", label: "Knowledge Graph", icon: "hub" },
    { id: "flashcards", label: "Flashcards", icon: "style" },
    { id: "quizzes", label: "Quizzes", icon: "quiz" },
    { id: "topic-tree-and-summary", label: "Topic Tree & Summary", icon: "account_tree" },
    { id: "cheat-sheet", label: "Cheat Sheet", icon: "description" },
    { id: "teach-me-mode", label: "Teach Me", icon: "school" },
  ];

  const repositoryLinks: Array<{ id: NavTab; label: string; icon: string }> = [
    { id: "library", label: "Library", icon: "folder" },
    { id: "collections", label: "Collections", icon: "folder_copy" },
    { id: "history", label: "History", icon: "schedule" },
    { id: "settings", label: "Settings", icon: "tune" },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-lowest/80 dark:bg-surface-navy-depth/95 backdrop-blur-xl border-r border-border-glass shadow-sm dark:shadow-2xl z-50 flex flex-col justify-between overflow-y-auto transition-colors duration-200">
      <div className="flex flex-col">
        {/* Logo and Brand Title */}
        <div className="h-16 px-space-lg flex items-center gap-space-sm border-b border-border-glass">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-on-primary shadow-sm shadow-primary/30">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </div>
          <div className="flex flex-col">
            <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white tracking-tight leading-none font-bold">
              DocuNova
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-normal leading-none mt-1">
              Deeper Insights
            </span>
          </div>
        </div>

        {/* Search Quick Action */}
        <div className="px-space-md py-space-xs">
          <div
            onClick={() => onSelectTab("chat")}
            className="flex items-center justify-between px-space-sm py-1.5 bg-surface-container-low dark:bg-surface-container rounded-xl text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border border-border-glass"
          >
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[18px]">search</span>
              <span className="font-body-sm text-body-sm">Search...</span>
            </div>
            <kbd className="font-label-sm text-label-sm px-1.5 py-0.5 bg-surface-container-lowest dark:bg-surface-container-highest/80 text-on-surface-variant rounded-md shadow-sm border border-border-glass">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* Section: Workspace */}
        <div className="px-space-md pt-space-sm pb-space-xs">
          <span className="px-space-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
            Workspace
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 px-space-md">
          {workspaceLinks.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-space-sm px-space-sm py-2 rounded-xl transition-all text-left ${
                  isActive
                    ? "bg-primary-container text-on-primary font-title-md shadow-sm dark:shadow-[0_0_16px_rgba(99,102,241,0.35)]"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-label-md text-label-md"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Section: Repository */}
        <div className="px-space-md pt-space-md pb-space-xs">
          <span className="px-space-sm font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
            Repository
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 px-space-md">
          {repositoryLinks.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-space-sm px-space-sm py-2 rounded-xl transition-all text-left ${
                  isActive
                    ? "bg-primary-container text-on-primary font-title-md shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-label-md text-label-md"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Pro Engine & Collection Status */}
      <div className="p-space-md mb-2">
        <div className="p-space-sm bg-surface-container-low dark:bg-surface-elevated/80 rounded-xl flex items-center gap-space-sm border border-border-glass shadow-inner">
          <div className="w-8 h-8 rounded-lg bg-primary-fixed dark:bg-indigo-500/20 dark:border dark:border-indigo-400/30 flex items-center justify-center text-primary dark:text-indigo-300 font-title-md text-title-md shadow-sm">
            AI
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-label-md text-label-md text-on-surface dark:text-slate-100 font-semibold truncate">
              Pro Engine
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {isReady ? "Ready · v2.4 Multimodal" : "Syncing Knowledge"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
