"use client";

import { useEffect, useMemo, useState } from "react";
import SourceDocSelector from "../source-doc-selector";
import { Document, LearningArtifact, LearningEvidence, learningSourceUrl } from "../../lib/api";

interface TopicTreeViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  artifact: LearningArtifact | null;
  loading: boolean;
  ready: boolean;
  onGenerate: (topic?: string, regenerate?: boolean, selectedIds?: string[]) => void;
  onSelectTopic?: (topic: string) => void;
  onNavigateUpload?: () => void;
}

export default function TopicTreeView({
  collectionId,
  documents,
  selectedDocIds,
  onSelectDocIds,
  selectedDocId,
  onSelectDocId,
  artifact,
  loading,
  ready,
  onGenerate,
  onSelectTopic,
  onNavigateUpload,
}: TopicTreeViewProps) {
  const [topic, setTopic] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Multiple source document state
  const [localDocIds, setLocalDocIds] = useState<string[]>(
    selectedDocIds ?? (selectedDocId ? [selectedDocId] : documents.map((d) => d.id))
  );

  useEffect(() => {
    if (selectedDocIds) {
      setLocalDocIds(selectedDocIds);
    } else if (selectedDocId) {
      setLocalDocIds([selectedDocId]);
    }
  }, [selectedDocIds, selectedDocId]);

  const effectiveDocIds = selectedDocIds ?? localDocIds;
  const handleDocIdsChange = (ids: string[]) => {
    setLocalDocIds(ids);
    if (onSelectDocIds) onSelectDocIds(ids);
    if (onSelectDocId) onSelectDocId(ids[0] ?? "");
  };

  const nodes = artifact?.content?.nodes ?? [];
  const hasNodes = nodes.length > 0;

  // Active node to display in the reading card
  const activeNode = useMemo(() => {
    if (!hasNodes) return null;
    if (selectedNodeId) {
      const found = nodes.find((n: any) => n.id === selectedNodeId);
      if (found) return found;
    }
    return nodes[0];
  }, [hasNodes, nodes, selectedNodeId]);

  const filteredNodes = useMemo(() => {
    if (!filterQuery.trim()) return nodes;
    return nodes.filter((n: any) =>
      n.title?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      n.summary?.toLowerCase().includes(filterQuery.toLowerCase())
    );
  }, [nodes, filterQuery]);

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const expandAll = () => {
    const allExp: Record<string, boolean> = {};
    nodes.forEach((n: any) => {
      allExp[n.id] = true;
    });
    setExpandedNodes(allExp);
  };

  const collapseAll = () => {
    const noExp: Record<string, boolean> = {};
    nodes.forEach((n: any) => {
      noExp[n.id] = false;
    });
    setExpandedNodes(noExp);
  };

  // Build tree hierarchy (root nodes vs child nodes)
  const rootNodes = useMemo(() => {
    return filteredNodes.filter((n: any) => n.parent_id === null || !n.parent_id);
  }, [filteredNodes]);

  const getChildren = (parentId: string) => {
    return filteredNodes.filter((n: any) => n.parent_id === parentId).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  };

  return (
    <div className="flex flex-col w-full relative pb-16">
      {/* Ambient glowing backdrops */}
      <div className="absolute -top-10 left-1/4 w-96 h-96 bg-indigo-600/10 dark:bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-20 right-10 w-80 h-80 bg-purple-600/10 dark:bg-purple-600/15 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Page Header Area */}
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-label-sm uppercase tracking-wider mb-1">
          <span className="material-symbols-outlined text-[16px]">account_tree</span>
          <span>Knowledge Hierarchy</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-text-crisp-white tracking-tight font-bold">
          Topic Tree &amp; Summary
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Explore structured outlines, hierarchical breakdowns, and executive summaries synthesized directly from your documents.
        </p>
      </div>

      {/* Source Document & Topic Selector Bar */}
      <SourceDocSelector
        documents={documents}
        selectedDocIds={effectiveDocIds}
        onSelectDocIds={handleDocIdsChange}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (optional, e.g. Attention Mechanisms, Methodology)..."
        onGenerate={() => onGenerate(topic.trim(), Boolean(artifact), effectiveDocIds)}
        generateLabel={artifact ? "Regenerate Tree" : "Generate Topic Tree"}
        loading={loading}
        disabled={!ready || effectiveDocIds.length === 0}
      />

      {/* Main Two-Column Split Layout */}
      {loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-indigo-400 animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Parsing document structure and synthesizing hierarchical topics...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Validating parent-child relationships and citations
          </span>
        </div>
      ) : !artifact ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">account_tree</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Topic Tree Generated Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload your technical documents to synthesize hierarchical topic trees."
                : "Select your source document above, enter an optional focus topic, and click Generate Topic Tree."}
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
              onClick={() => onGenerate(topic.trim(), false)}
              disabled={!ready || documents.length === 0}
              className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-title-md text-title-md shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              Generate Topic Tree →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: Collapsible Topic Tree Navigation (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col bg-surface-elevated/90 border border-border-glass backdrop-blur-xl rounded-2xl p-5 shadow-2xl">
            {/* Tree Header & Quick Search */}
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <span className="font-title-md text-title-md text-text-crisp-white font-bold">Ontology Map</span>
                <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-label-sm text-label-sm px-2 py-0.5 rounded-full font-semibold">
                  {nodes.length} Nodes
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={expandAll}
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded bg-surface-base dark:bg-slate-800 border border-border-glass"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  type="button"
                  className="text-xs text-on-surface-variant hover:text-on-surface dark:hover:text-white font-semibold px-2 py-1 rounded bg-surface-base dark:bg-slate-800 border border-border-glass"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Filter Input */}
            <div className="relative w-full mb-4">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter nodes or concept..."
                type="text"
                className="w-full bg-surface-base dark:bg-slate-900 border border-border-glass text-on-surface dark:text-slate-100 text-body-sm font-body-sm rounded-xl pl-9 pr-3 py-2 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-on-surface-variant/70 dark:placeholder:text-slate-400"
              />
            </div>

            {/* Interactive Tree Structure */}
            <div className="flex flex-col gap-1 select-none max-h-[500px] overflow-y-auto pr-1">
              {rootNodes.length === 0 ? (
                <div className="p-4 text-center text-on-surface-variant text-sm">
                  No topics found matching filter.
                </div>
              ) : (
                rootNodes.map((rootNode: any) => {
                  const children = getChildren(rootNode.id);
                  const isExpanded = expandedNodes[rootNode.id] ?? true;
                  const isSelected = activeNode?.id === rootNode.id;

                  return (
                    <div key={rootNode.id} className="flex flex-col">
                      <div
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white font-semibold shadow-sm"
                            : "hover:bg-surface-base text-on-surface hover:text-text-crisp-white"
                        }`}
                        onClick={() => {
                          setSelectedNodeId(rootNode.id);
                        }}
                      >
                        <div className="flex items-center gap-1.5 truncate flex-1">
                          {children.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(rootNode.id);
                              }}
                              className="p-0.5 rounded hover:bg-white/10"
                            >
                              <span
                                className={`material-symbols-outlined text-[18px] ${
                                  isSelected ? "text-indigo-200" : "text-indigo-400"
                                } transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                              >
                                expand_more
                              </span>
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <span className={`material-symbols-outlined text-[18px] ${isSelected ? "text-white" : "text-indigo-400"}`}>
                            folder_open
                          </span>
                          <span className="font-label-md text-label-md truncate">{rootNode.title}</span>
                        </div>
                        {children.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(rootNode.id);
                            }}
                            className="font-label-sm text-label-sm opacity-70 shrink-0 ml-2 hover:opacity-100"
                          >
                            {children.length} subtopics
                          </button>
                        )}
                      </div>

                      {/* Children Container */}
                      {isExpanded && children.length > 0 && (
                        <div className="flex flex-col pl-4 ml-3 border-l border-border-glass gap-1 my-1">
                          {children.map((child: any) => {
                            const subChildren = getChildren(child.id);
                            const isChildExpanded = expandedNodes[child.id] ?? true;
                            const isChildSelected = activeNode?.id === child.id;
                            return (
                              <div key={child.id} className="flex flex-col">
                                <div
                                  onClick={() => {
                                    setSelectedNodeId(child.id);
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                    isChildSelected
                                      ? "bg-indigo-600 text-white font-semibold shadow-sm"
                                      : "text-on-surface-variant hover:text-text-crisp-white hover:bg-surface-base"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate flex-1">
                                    {subChildren.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleExpand(child.id);
                                        }}
                                        className="p-0.5 rounded hover:bg-white/10"
                                      >
                                        <span
                                          className={`material-symbols-outlined text-[16px] text-indigo-400 transition-transform ${
                                            isChildExpanded ? "" : "-rotate-90"
                                          }`}
                                        >
                                          expand_more
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 ml-1" />
                                    )}
                                    <span className="font-body-sm text-body-sm truncate">{child.title}</span>
                                  </div>
                                  {child.inferred && (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                                      inferred
                                    </span>
                                  )}
                                </div>

                                {/* Sub-Children Container */}
                                {isChildExpanded && subChildren.length > 0 && (
                                  <div className="flex flex-col pl-4 ml-3 border-l border-border-glass gap-1 my-1">
                                    {subChildren.map((subChild: any) => {
                                      const isSubSelected = activeNode?.id === subChild.id;
                                      return (
                                        <button
                                          key={subChild.id}
                                          type="button"
                                          onClick={() => setSelectedNodeId(subChild.id)}
                                          className={`w-full flex items-center justify-between px-3 py-1 rounded-md text-left transition-all ${
                                            isSubSelected
                                              ? "bg-indigo-600 text-white font-semibold shadow-sm"
                                              : "text-on-surface-variant hover:text-text-crisp-white hover:bg-surface-base"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            <span className="w-1 h-1 rounded-full bg-indigo-300 shrink-0 ml-1" />
                                            <span className="font-body-sm text-body-sm truncate">{subChild.title}</span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Detailed Content Reading Card (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col bg-surface-elevated/90 border border-border-glass backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
            {activeNode ? (
              <>
                {/* Reading Header & Metadata */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-2 border-b border-border-glass mb-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-label-sm text-label-sm text-indigo-400 uppercase font-bold tracking-wider">
                        Topic Node
                      </span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Rank #{activeNode.sort_order ?? 1}
                      </span>
                    </div>
                    <h2 className="font-headline-md text-headline-md text-text-crisp-white tracking-tight font-bold">
                      {activeNode.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      aria-label="Copy summary"
                      onClick={() => navigator.clipboard?.writeText(activeNode.summary || "")}
                      className="p-2 rounded-lg bg-surface-base border border-border-glass text-on-surface-variant hover:text-text-crisp-white transition-colors"
                      title="Copy Summary"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">content_copy</span>
                    </button>
                  </div>
                </div>

                {/* Section: Executive Summary */}
                <div className="p-4 bg-indigo-950/20 dark:bg-indigo-950/40 border border-indigo-500/20 rounded-xl mb-6 relative overflow-hidden">
                  <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center gap-2 text-indigo-400 font-title-md text-title-md mb-2">
                    <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                    <span>Executive Summary</span>
                  </div>
                  <p className="font-body-lg text-body-lg text-on-surface leading-relaxed">
                    {activeNode.summary || "No detailed summary generated for this node."}
                  </p>
                </div>

                {/* Grounded Source References */}
                {artifact.evidence && artifact.evidence.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border-glass">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-400 text-[18px]">link</span>
                      <span className="font-title-md text-title-md text-text-crisp-white">Grounded Citations</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {artifact.evidence.map((src: LearningEvidence, idx: number) => (
                        <a
                          key={src.evidence_id}
                          href={learningSourceUrl(src)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-2.5 bg-surface-base border border-border-glass hover:border-indigo-500/40 rounded-xl transition-all shadow-sm group"
                        >
                          <span className="material-symbols-outlined text-[18px] text-rose-400">picture_as_pdf</span>
                          <span className="font-label-sm text-label-sm text-text-crisp-white group-hover:text-indigo-400">
                            {src.filename} {src.page_number ? `• Page ${src.page_number}` : `• Ref ${idx + 1}`}
                          </span>
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">open_in_new</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-on-surface-variant">
                Select a topic from the left ontology tree to review its synthesis.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
