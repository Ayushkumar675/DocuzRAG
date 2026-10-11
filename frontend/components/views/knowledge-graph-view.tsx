"use client";

import React, { useMemo, useState, useRef, useCallback } from "react";
import SourceDocSelector from "../source-doc-selector";
import {
  Document,
  generateLearning,
  LearningArtifact,
  LearningEvidence,
  learningSourceUrl,
} from "../../lib/api";

interface KnowledgeGraphViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  isReady: boolean;
  onNavigateUpload?: () => void;
}

interface NodeHierarchyInfo {
  level: number;
  branchIndex: number;
  isCentral: boolean;
  parentId: string | null;
  radius: number;
  color: string;
}

const BRANCH_PALETTE = [
  "#4f46e5", // Indigo (WCAG AA compliant contrast with white text >= 4.5:1)
  "#0284c7", // Sky/Blue
  "#059669", // Emerald
  "#d97706", // Amber
  "#db2777", // Rose
  "#7c3aed", // Violet
  "#0d9488", // Teal
  "#ea580c", // Deep Orange
];

function getWrappedNodeLines(name: string, maxCharsPerLine: number = 11): string[] {
  if (!name) return [""];
  const trimmed = name.trim();
  if (trimmed.length <= maxCharsPerLine) {
    return [trimmed];
  }
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    if (trimmed.length > maxCharsPerLine * 2 - 2) {
      return [trimmed.slice(0, maxCharsPerLine), trimmed.slice(maxCharsPerLine, maxCharsPerLine * 2 - 2) + "…"];
    }
    return [trimmed.slice(0, maxCharsPerLine), trimmed.slice(maxCharsPerLine)];
  }
  const line1Words: string[] = [];
  const line2Words: string[] = [];
  let line1Len = 0;

  for (const word of words) {
    const candidateLen = line1Len === 0 ? word.length : line1Len + 1 + word.length;
    if (candidateLen <= maxCharsPerLine) {
      line1Words.push(word);
      line1Len = candidateLen;
    } else {
      line2Words.push(word);
    }
  }

  if (line1Words.length === 0) {
    line1Words.push(words[0]);
    line2Words.push(...words.slice(1));
  }

  const line1 = line1Words.join(" ");
  let line2 = line2Words.join(" ");
  if (line2.length > maxCharsPerLine + 2) {
    line2 = line2.slice(0, maxCharsPerLine + 1) + "…";
  }

  return line2 ? [line1, line2] : [line1];
}

export default function KnowledgeGraphView({
  collectionId,
  documents,
  selectedDocId,
  onSelectDocId,
  selectedDocIds,
  onSelectDocIds,
  isReady,
  onNavigateUpload,
}: KnowledgeGraphViewProps) {
  const [artifact, setArtifact] = useState<LearningArtifact | null>(null);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<"tree" | "radial">("tree");
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const allNodes = artifact?.content?.nodes ?? [];
  const allEdges = artifact?.content?.edges ?? [];

  // Filter nodes based on search & category
  const filteredNodes = useMemo(() => {
    return allNodes.filter((node: any) => {
      const matchesSearch =
        node.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (selectedFilter === "All") return true;
      if (selectedFilter === "Explicit") return node.status === "explicit";
      if (selectedFilter === "Inferred") return node.status === "inferred";
      return true;
    });
  }, [allNodes, searchQuery, selectedFilter]);

  // Batches from sources
  const batches = useMemo(() => {
    const set = new Set<string>();
    allNodes.forEach((node: any) => {
      const match = node.id.match(/^b(\d+)-/);
      if (match) set.add(match[1]);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [allNodes]);

  const activeNodes = useMemo(() => {
    if (!selectedBatch) return filteredNodes;
    return filteredNodes.filter((n: any) => n.id.startsWith(`b${selectedBatch}-`));
  }, [filteredNodes, selectedBatch]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((n: any) => n.id)), [activeNodes]);

  const activeEdges = useMemo(() => {
    return allEdges.filter(
      (e: any) => activeNodeIds.has(e.source_node_id) && activeNodeIds.has(e.target_node_id)
    );
  }, [allEdges, activeNodeIds]);

  // Connected nodes map for highlighting branches on hover/select
  const connectedNodeIds = useMemo(() => {
    const targetId = hoveredNodeId || selectedNode?.id;
    if (!targetId) return null;
    const connected = new Set<string>([targetId]);
    activeEdges.forEach((e: any) => {
      if (e.source_node_id === targetId) connected.add(e.target_node_id);
      if (e.target_node_id === targetId) connected.add(e.source_node_id);
    });
    return connected;
  }, [hoveredNodeId, selectedNode, activeEdges]);

  // Compute Hierarchical Tree & Radial Branching Graph Layout
  const { centralNodeId, hierarchyInfo, defaultPositions, svgWidth, svgHeight } = useMemo(() => {
    if (activeNodes.length === 0) {
      return {
        centralNodeId: null,
        hierarchyInfo: {},
        defaultPositions: {},
        svgWidth: 920,
        svgHeight: 520,
      };
    }

    // 1. Build adjacency maps & degrees
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    const outDegree: Record<string, number> = {};
    const allNeighbors: Record<string, Set<string>> = {};

    activeNodes.forEach((n: any) => {
      adj[n.id] = [];
      inDegree[n.id] = 0;
      outDegree[n.id] = 0;
      allNeighbors[n.id] = new Set();
    });

    activeEdges.forEach((e: any) => {
      if (adj[e.source_node_id] && adj[e.target_node_id]) {
        adj[e.source_node_id].push(e.target_node_id);
        outDegree[e.source_node_id] = (outDegree[e.source_node_id] || 0) + 1;
        inDegree[e.target_node_id] = (inDegree[e.target_node_id] || 0) + 1;
        allNeighbors[e.source_node_id].add(e.target_node_id);
        allNeighbors[e.target_node_id].add(e.source_node_id);
      }
    });

    // 2. Identify central topic node
    let bestRootId = activeNodes[0].id;
    const searchTopic = (topic || artifact?.content?.title || "").toLowerCase().trim();
    const titleMatch = searchTopic
      ? activeNodes.find(
          (n: any) =>
            n.name.toLowerCase().includes(searchTopic) ||
            searchTopic.includes(n.name.toLowerCase())
        )
      : null;

    if (titleMatch) {
      bestRootId = titleMatch.id;
    } else {
      let maxScore = -1;
      activeNodes.forEach((n: any) => {
        const score = (outDegree[n.id] || 0) * 1.5 + (inDegree[n.id] || 0);
        if (score > maxScore) {
          maxScore = score;
          bestRootId = n.id;
        }
      });
    }

    // 3. BFS Traversal for Hierarchical Branch Construction
    const visited = new Set<string>([bestRootId]);
    const levels: Record<string, number> = { [bestRootId]: 0 };
    const parentMap: Record<string, string | null> = { [bestRootId]: null };
    const branchMap: Record<string, number> = { [bestRootId]: -1 };
    const queue: string[] = [bestRootId];

    let branchCounter = 0;
    const getOrderedNeighbors = (nodeId: string) => {
      const out = adj[nodeId] || [];
      const others = Array.from(allNeighbors[nodeId] || []).filter((id) => !out.includes(id));
      return [...out, ...others];
    };

    // Primary neighbors form level 1 branch heads
    const directNeighbors = getOrderedNeighbors(bestRootId).filter((id) => id !== bestRootId);
    directNeighbors.forEach((nbrId) => {
      if (!visited.has(nbrId)) {
        visited.add(nbrId);
        levels[nbrId] = 1;
        parentMap[nbrId] = bestRootId;
        branchMap[nbrId] = branchCounter++;
        queue.push(nbrId);
      }
    });

    // Continue BFS for level 2+ sub-branches
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLevel = levels[curr] || 0;
      const currBranch = branchMap[curr] ?? 0;

      const nbrs = getOrderedNeighbors(curr);
      nbrs.forEach((nbrId) => {
        if (!visited.has(nbrId)) {
          visited.add(nbrId);
          levels[nbrId] = currLevel + 1;
          parentMap[nbrId] = curr;
          branchMap[nbrId] = currBranch;
          queue.push(nbrId);
        }
      });
    }

    // Attach any disconnected or remaining nodes
    activeNodes.forEach((n: any) => {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        levels[n.id] = 1;
        parentMap[n.id] = bestRootId;
        branchMap[n.id] = branchCounter++;
      }
    });

    const numBranches = Math.max(1, branchCounter);

    // 4. Node Hierarchy Details (styling, radius, color)
    const hInfo: Record<string, NodeHierarchyInfo> = {};
    activeNodes.forEach((n: any) => {
      const isCentral = n.id === bestRootId;
      const level = levels[n.id] ?? 1;
      const branchIdx = Math.max(0, branchMap[n.id] ?? 0);
      const color = isCentral
        ? "#4f46e5"
        : BRANCH_PALETTE[branchIdx % BRANCH_PALETTE.length];
      const radius = isCentral ? 48 : level === 1 ? 38 : 32;

      hInfo[n.id] = {
        level,
        branchIndex: branchIdx,
        isCentral,
        parentId: parentMap[n.id],
        radius,
        color,
      };
    });

    // 5. Position calculations
    const positions: Record<string, { x: number; y: number }> = {};
    let calcWidth = 1000;
    let calcHeight = 580;

    if (layoutMode === "radial") {
      // Radial Branching Mind-Map Layout
      calcWidth = Math.max(980, 720 + numBranches * 60);
      calcHeight = Math.max(720, 720);
      const centerX = calcWidth / 2;
      const centerY = calcHeight / 2;

      positions[bestRootId] = { x: centerX, y: centerY };

      const branchGroups: Record<number, { level1: string[]; subnodes: string[] }> = {};
      for (let b = 0; b < numBranches; b++) {
        branchGroups[b] = { level1: [], subnodes: [] };
      }

      activeNodes.forEach((n: any) => {
        if (n.id === bestRootId) return;
        const b = hInfo[n.id]?.branchIndex ?? 0;
        if (!branchGroups[b]) branchGroups[b] = { level1: [], subnodes: [] };
        if (hInfo[n.id]?.level === 1) {
          branchGroups[b].level1.push(n.id);
        } else {
          branchGroups[b].subnodes.push(n.id);
        }
      });

      const angleStep = (2 * Math.PI) / numBranches;
      const R1 = 200;
      const R2 = 340;

      for (let b = 0; b < numBranches; b++) {
        const baseAngle = b * angleStep - Math.PI / 2;
        const { level1, subnodes } = branchGroups[b];

        level1.forEach((id, idx) => {
          const spread = (idx - (level1.length - 1) / 2) * (angleStep * 0.35);
          const theta = baseAngle + spread;
          positions[id] = {
            x: Math.round(centerX + R1 * Math.cos(theta)),
            y: Math.round(centerY + R1 * Math.sin(theta)),
          };
        });

        subnodes.forEach((id, idx) => {
          const spread = (idx - (subnodes.length - 1) / 2) * (angleStep * 0.45);
          const theta = baseAngle + spread;
          positions[id] = {
            x: Math.round(centerX + R2 * Math.cos(theta)),
            y: Math.round(centerY + R2 * Math.sin(theta)),
          };
        });
      }
    } else {
      // Hierarchical Tree Flow Layout
      const maxLevel = Math.max(...Object.values(levels), 1);
      const branchTrees: Record<number, { level1: string[]; subnodes: string[] }> = {};
      for (let b = 0; b < numBranches; b++) {
        branchTrees[b] = { level1: [], subnodes: [] };
      }

      activeNodes.forEach((n: any) => {
        if (n.id === bestRootId) return;
        const b = hInfo[n.id]?.branchIndex ?? 0;
        if (!branchTrees[b]) branchTrees[b] = { level1: [], subnodes: [] };
        if (hInfo[n.id]?.level === 1) {
          branchTrees[b].level1.push(n.id);
        } else {
          branchTrees[b].subnodes.push(n.id);
        }
      });

      const branchWeights: number[] = [];
      for (let b = 0; b < numBranches; b++) {
        const count = Math.max(1, branchTrees[b].level1.length + branchTrees[b].subnodes.length);
        branchWeights.push(count);
      }
      const totalWeight = branchWeights.reduce((acc, w) => acc + w, 0);

      const minBranchWidth = 220;
      calcWidth = Math.max(1020, 120 + numBranches * minBranchWidth);
      calcHeight = Math.max(580, 140 + maxLevel * 180);

      const leftMargin = 70;
      const availableWidth = calcWidth - 2 * leftMargin;

      // Central topic on top center
      positions[bestRootId] = { x: Math.round(calcWidth / 2), y: 80 };

      let currentX = leftMargin;
      for (let b = 0; b < numBranches; b++) {
        const branchWidth = (branchWeights[b] / totalWeight) * availableWidth;
        const branchCenterX = currentX + branchWidth / 2;
        const { level1, subnodes } = branchTrees[b];

        level1.forEach((id, idx) => {
          const offset = (idx - (level1.length - 1) / 2) * 95;
          positions[id] = {
            x: Math.round(branchCenterX + offset),
            y: 230,
          };
        });

        subnodes.forEach((id, idx) => {
          const subCount = subnodes.length;
          const subSlot = branchWidth / (subCount + 1);
          const nodeLevel = hInfo[id]?.level ?? 2;
          const nodeY = 230 + (nodeLevel - 1) * 165;
          positions[id] = {
            x: Math.round(currentX + (idx + 1) * subSlot),
            y: nodeY,
          };
        });

        currentX += branchWidth;
      }
    }

    return {
      centralNodeId: bestRootId,
      hierarchyInfo: hInfo,
      defaultPositions: positions,
      svgWidth: calcWidth,
      svgHeight: calcHeight,
    };
  }, [activeNodes, activeEdges, topic, artifact, layoutMode]);

  // Combine default computed positions with any user drag adjustments
  const finalPositions = useMemo(() => {
    return { ...defaultPositions, ...customPositions };
  }, [defaultPositions, customPositions]);

  // Interactive Drag & Drop Handlers
  const handleMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const currentPos = finalPositions[nodeId];
      if (!currentPos) return;

      dragRef.current = {
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        initX: currentPos.x,
        initY: currentPos.y,
      };
    },
    [finalPositions]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const { nodeId, startX, startY, initX, initY } = dragRef.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;

      setCustomPositions((prev) => ({
        ...prev,
        [nodeId]: {
          x: Math.round(initX + dx),
          y: Math.round(initY + dy),
        },
      }));
    },
    [zoom]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  async function handleGenerate(regenerate = false) {
    if (!collectionId || !isReady || loading || documents.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const selectedScope =
        selectedDocIds && selectedDocIds.length > 0
          ? selectedDocIds
          : selectedDocId
          ? [selectedDocId]
          : null;
      const res = await generateLearning("knowledge-graph", {
        collection_id: collectionId,
        selected_document_ids: selectedScope,
        topic: topic.trim(),
        difficulty: "medium",
        level: "beginner",
        count: 12,
        format: "quick_revision",
        regenerate,
      });
      setArtifact(res);
      setCustomPositions({});
      if (res.content?.nodes?.[0]) {
        setSelectedNode(res.content.nodes[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute knowledge graph.");
    } finally {
      setLoading(false);
    }
  }

  function evidenceFor(ids: string[]): LearningEvidence[] {
    return (artifact?.evidence ?? []).filter((item) => ids.includes(item.evidence_id));
  }

  return (
    <div className="relative w-full pb-16">
      {/* Dynamic Glow Elements */}
      <div className="absolute -top-12 left-1/4 w-96 h-96 bg-primary-fixed/40 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-48 right-12 w-80 h-80 bg-tertiary-fixed/30 dark:bg-sky-900/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Screen Header */}
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300 font-label-sm text-label-sm font-semibold uppercase tracking-wider border border-border-glass">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Multimodal Synthesizer
          </span>
          <span className="text-on-surface-variant font-label-sm text-label-sm">
            Interactive Hierarchical Concept Graph
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface dark:text-text-crisp-white tracking-tight font-bold">
          Knowledge Graph
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Hierarchical concept branches and semantic linkages. Select a source document and enter an optional topic to synthesize a structured knowledge map.
        </p>
      </div>

      {/* Unified Source Document & Topic Selector Bar */}
      <SourceDocSelector
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDocId={onSelectDocId}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={onSelectDocIds}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (e.g. Neural Networks, Architecture, Optimization)..."
        onGenerate={() => handleGenerate(Boolean(artifact))}
        generateLabel={artifact ? "Recompute Graph" : "Generate Knowledge Graph"}
        loading={loading}
        disabled={!isReady}
      />

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/30 text-error font-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => handleGenerate(true)} className="underline font-semibold ml-4">
            Retry
          </button>
        </div>
      )}

      {/* Main Studio Grid */}
      {loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-primary animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Synthesizing hierarchical concept nodes and extracting grounded relationships...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Structuring central entity and branching subtopics
          </span>
        </div>
      ) : !artifact ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">hub</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Graph Generated Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload your technical documents to start generating source-grounded knowledge graphs."
                : "Select your source document above, enter an optional focus topic, and click Generate Knowledge Graph."}
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
              onClick={() => handleGenerate(false)}
              disabled={!isReady || documents.length === 0}
              className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-title-md text-title-md shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              Generate Knowledge Graph →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
          {/* Left Column: Entity Directory (Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-border-glass mb-3">
                <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-bold">
                  Core Entities
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container dark:bg-surface-base text-on-surface-variant font-label-sm text-label-sm font-semibold">
                  {filteredNodes.length} Concepts
                </span>
              </div>

              {/* Search Inside Graph */}
              <div className="relative mb-3">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter entities in graph..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface-container-low dark:bg-surface-base text-on-surface font-body-sm text-body-sm border border-border-glass focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Type Filter Buttons */}
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
                {["All", "Explicit", "Inferred"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSelectedFilter(filter)}
                    className={`px-3 py-1 rounded-lg font-label-sm text-label-sm transition-all whitespace-nowrap ${
                      selectedFilter === filter
                        ? "bg-indigo-600 text-white font-semibold shadow-sm"
                        : "bg-surface-container-low dark:bg-surface-base text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Node List Scrollable */}
              <div className="flex flex-col gap-1.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredNodes.length === 0 ? (
                  <div className="py-6 text-center text-on-surface-variant text-body-sm">
                    No matching entities found.
                  </div>
                ) : (
                  filteredNodes.map((node: any) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isCentral = node.id === centralNodeId;
                    const info = hierarchyInfo[node.id];

                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNode(node)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        className={`flex items-start justify-between p-2.5 rounded-xl text-left transition-all ${
                          isSelected
                            ? "bg-indigo-600/15 border border-indigo-500 text-on-surface dark:text-text-crisp-white shadow-sm"
                            : "hover:bg-surface-container dark:hover:bg-surface-base text-on-surface-variant hover:text-on-surface border border-transparent"
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: info?.color || "#6366f1" }}
                            />
                            <span className="font-title-md text-title-md leading-tight truncate font-semibold">
                              {node.name}
                            </span>
                            {isCentral && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Central
                              </span>
                            )}
                          </div>
                          <span className="font-body-sm text-body-sm line-clamp-1 opacity-75 mt-0.5">
                            {node.description}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            node.status === "explicit"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-indigo-500/20 text-indigo-400"
                          }`}
                        >
                          {node.status}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Canvas & Node Inspector (Span 8) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* SVG Visual Canvas Stage */}
            <div className="p-4 rounded-3xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-lg relative flex flex-col">
              {/* Canvas Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-glass">
                <div className="flex items-center gap-2">
                  <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-bold">
                    {artifact.content?.title || "Topic Knowledge Graph"}
                  </span>
                  <span className="text-on-surface-variant font-label-sm text-label-sm">
                    {activeNodes.length} nodes • {activeEdges.length} links
                  </span>
                </div>

                {/* Toolbar Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Layout Mode Switcher */}
                  <div className="flex items-center gap-1 bg-surface-base p-1 rounded-xl border border-border-glass">
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutMode("tree");
                        setCustomPositions({});
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        layoutMode === "tree"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                      title="Hierarchical Tree with branching levels"
                    >
                      <span className="material-symbols-outlined text-[14px]">account_tree</span>
                      <span>Tree Flow</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutMode("radial");
                        setCustomPositions({});
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        layoutMode === "radial"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                      title="Radial Mindmap branching from center"
                    >
                      <span className="material-symbols-outlined text-[14px]">flare</span>
                      <span>Radial Map</span>
                    </button>
                  </div>

                  {/* Reset Positions Button if dragged */}
                  {Object.keys(customPositions).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomPositions({})}
                      className="px-2 py-1 rounded-xl bg-surface-base hover:bg-surface-container text-xs font-semibold text-on-surface-variant border border-border-glass"
                      title="Reset manual node drag positions"
                    >
                      Reset Positions
                    </button>
                  )}

                  {/* Batches / Source selector */}
                  {batches.length > 1 && (
                    <div className="flex items-center gap-1 bg-surface-base p-1 rounded-xl border border-border-glass">
                      <button
                        type="button"
                        onClick={() => setSelectedBatch(null)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                          selectedBatch === null
                            ? "bg-indigo-600 text-white"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        All
                      </button>
                      {batches.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setSelectedBatch(b)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            selectedBatch === b
                              ? "bg-indigo-600 text-white"
                              : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          Source {Number(b) + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 bg-surface-base p-1 rounded-xl border border-border-glass">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface"
                      title="Zoom Out"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      className="px-1.5 py-0.5 text-xs font-bold text-on-surface-variant"
                      title="Reset Zoom"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface"
                      title="Zoom In"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Graph Canvas */}
              <div className="w-full overflow-auto max-h-[500px] bg-surface-container-low/50 dark:bg-[#070b12] rounded-2xl border border-border-glass mt-3">
                <svg
                  ref={svgRef}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{
                    width: `${svgWidth * zoom}px`,
                    height: `${svgHeight * zoom}px`,
                  }}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="mx-auto block transition-all select-none cursor-grab active:cursor-grabbing"
                >
                  <defs>
                    <marker
                      id="graph-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto"
                    >
                      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#6366f1" />
                    </marker>

                    {/* Glowing Filter for Central Node */}
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Render Curved Branch Edges */}
                  {activeEdges.map((edge: any) => {
                    const from = finalPositions[edge.source_node_id];
                    const to = finalPositions[edge.target_node_id];
                    if (!from || !to) return null;

                    const isHighlighted =
                      hoveredNodeId === edge.source_node_id ||
                      hoveredNodeId === edge.target_node_id ||
                      selectedNode?.id === edge.source_node_id ||
                      selectedNode?.id === edge.target_node_id;

                    const isDimmed =
                      (hoveredNodeId || selectedNode) &&
                      !connectedNodeIds?.has(edge.source_node_id) &&
                      !connectedNodeIds?.has(edge.target_node_id);

                    const fromRadius = hierarchyInfo[edge.source_node_id]?.radius || 32;
                    const toRadius = hierarchyInfo[edge.target_node_id]?.radius || 32;

                    // Compute smooth trimmed Bezier path terminating at outer node circles
                    let pathD = "";
                    let midX = (from.x + to.x) / 2;
                    let midY = (from.y + to.y) / 2;

                    if (layoutMode === "tree") {
                      const deltaY = to.y - from.y;
                      if (Math.abs(deltaY) > 30) {
                        const cY = (from.y + to.y) / 2;
                        const signY = to.y >= from.y ? 1 : -1;
                        const startX = from.x;
                        const startY = from.y + signY * fromRadius;
                        const endX = to.x;
                        const endY = to.y - signY * toRadius;
                        pathD = `M ${startX} ${startY} C ${from.x} ${cY}, ${to.x} ${cY}, ${endX} ${endY}`;
                      } else {
                        const cX = (from.x + to.x) / 2;
                        const cY = Math.min(from.y, to.y) - 30;
                        const dxS = cX - from.x;
                        const dyS = cY - from.y;
                        const dS = Math.hypot(dxS, dyS) || 1;
                        const startX = from.x + (dxS / dS) * fromRadius;
                        const startY = from.y + (dyS / dS) * fromRadius;

                        const dxE = to.x - cX;
                        const dyE = to.y - cY;
                        const dE = Math.hypot(dxE, dyE) || 1;
                        const endX = to.x - (dxE / dE) * toRadius;
                        const endY = to.y - (dyE / dE) * toRadius;

                        pathD = `M ${startX} ${startY} Q ${cX} ${cY}, ${endX} ${endY}`;
                        midX = cX;
                        midY = cY;
                      }
                    } else {
                      // Radial Curved Arc
                      const dx = to.x - from.x;
                      const dy = to.y - from.y;
                      const dist = Math.hypot(dx, dy) || 1;
                      const offset = Math.min(25, dist * 0.12);
                      const cX = midX - (dy / dist) * offset;
                      const cY = midY + (dx / dist) * offset;

                      const dxS = cX - from.x;
                      const dyS = cY - from.y;
                      const dS = Math.hypot(dxS, dyS) || 1;
                      const startX = from.x + (dxS / dS) * fromRadius;
                      const startY = from.y + (dyS / dS) * fromRadius;

                      const dxE = to.x - cX;
                      const dyE = to.y - cY;
                      const dE = Math.hypot(dxE, dyE) || 1;
                      const endX = to.x - (dxE / dE) * toRadius;
                      const endY = to.y - (dyE / dE) * toRadius;

                      pathD = `M ${startX} ${startY} Q ${cX} ${cY}, ${endX} ${endY}`;
                      midX = cX;
                      midY = cY;
                    }

                    const strokeColor = isHighlighted
                      ? "#818cf8"
                      : hierarchyInfo[edge.target_node_id]?.color || "#6366f1";

                    const relLabel = (edge.relation || "").trim();
                    const relDisplay = relLabel.length > 18 ? `${relLabel.slice(0, 17)}…` : relLabel;
                    const pillWidth = Math.max(52, relDisplay.length * 6.5 + 14);

                    return (
                      <g key={edge.id} className="transition-opacity duration-200" opacity={isDimmed ? 0.15 : 0.75}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isHighlighted ? 2.6 : 1.8}
                          strokeDasharray={edge.status === "inferred" ? "4 3" : undefined}
                          markerEnd="url(#graph-arrow)"
                        />
                        {/* Relationship Label Pill */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-pillWidth / 2}
                            y={-9}
                            width={pillWidth}
                            height={18}
                            rx={5}
                            className="fill-white dark:fill-[#131b2e] stroke-slate-300 dark:stroke-white/20 stroke-[1] shadow-sm"
                          />
                          <text
                            x={0}
                            y={3.5}
                            textAnchor="middle"
                            className="fill-slate-700 dark:fill-slate-200 text-[9px] font-semibold tracking-tight pointer-events-none"
                          >
                            {relDisplay}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* Render Hierarchical Branch Nodes */}
                  {activeNodes.map((node: any) => {
                    const pos = finalPositions[node.id];
                    if (!pos) return null;

                    const isSelected = selectedNode?.id === node.id;
                    const isHovered = hoveredNodeId === node.id;
                    const isCentral = node.id === centralNodeId;
                    const info = hierarchyInfo[node.id];
                    const radius = info?.radius || (isCentral ? 48 : 32);
                    const nodeColor = info?.color || (isCentral ? "#4f46e5" : "#4f46e5");

                    const isDimmed =
                      (hoveredNodeId || selectedNode) &&
                      !connectedNodeIds?.has(node.id);

                    const maxChars = isCentral ? 14 : info?.level === 1 ? 11 : 9;
                    const lines = getWrappedNodeLines(node.name, maxChars);
                    const fontSize = isCentral ? 11 : info?.level === 1 ? 10 : 9.5;

                    return (
                      <g
                        key={node.id}
                        onMouseDown={(e) => handleMouseDown(node.id, e)}
                        onClick={() => setSelectedNode(node)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        opacity={isDimmed ? 0.25 : 1}
                        className="cursor-grab active:cursor-grabbing group transition-opacity duration-200"
                      >
                        <title>{node.name}{node.description ? `: ${node.description}` : ""}</title>

                        {/* Outer Glow Ring for Central or Selected Node */}
                        {(isCentral || isSelected || isHovered) && (
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={radius + 8}
                            fill="none"
                            stroke={isCentral ? "#818cf8" : nodeColor}
                            strokeWidth={isCentral ? 2.5 : 2}
                            strokeDasharray={isCentral ? "4 3" : undefined}
                            opacity={0.7}
                          />
                        )}

                        {/* Central Node Badge */}
                        {isCentral && (
                          <g transform={`translate(${pos.x}, ${pos.y - radius - 10})`}>
                            <rect
                              x={-44}
                              y={-8}
                              width={88}
                              height={16}
                              rx={8}
                              className="fill-indigo-600 dark:fill-indigo-500 stroke-indigo-300 dark:stroke-indigo-400 stroke-[1] shadow-md"
                            />
                            <text
                              x={0}
                              y={4}
                              textAnchor="middle"
                              className="fill-white text-[8.5px] font-bold uppercase tracking-wider pointer-events-none select-none"
                            >
                              ★ Central Topic
                            </text>
                          </g>
                        )}

                        {/* Main Circle */}
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={radius}
                          fill={nodeColor}
                          stroke={isSelected ? "#ffffff" : isHovered ? "#ffffff" : "rgba(255,255,255,0.45)"}
                          strokeWidth={isSelected ? 3.5 : isHovered ? 2.5 : 2}
                          className="transition-all hover:brightness-110 shadow-md"
                        />

                        {/* Node Title (Fitted completely inside circle with optional 2nd wrapped line) */}
                        {lines.length === 1 ? (
                          <text
                            x={pos.x}
                            y={pos.y + (fontSize * 0.35)}
                            textAnchor="middle"
                            className="fill-white font-bold pointer-events-none select-none drop-shadow"
                            style={{ fontSize: `${fontSize}px` }}
                          >
                            {lines[0]}
                          </text>
                        ) : (
                          <text
                            x={pos.x}
                            y={pos.y - (fontSize * 0.4)}
                            textAnchor="middle"
                            className="fill-white font-bold pointer-events-none select-none drop-shadow"
                            style={{ fontSize: `${fontSize}px` }}
                          >
                            <tspan x={pos.x} dy="0">{lines[0]}</tspan>
                            <tspan x={pos.x} dy={fontSize * 1.25}>{lines[1]}</tspan>
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Canvas Legend Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-border-glass text-xs text-on-surface-variant">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 border border-indigo-400 inline-block" />
                    <span>Central Topic</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-sky-500 inline-block" />
                    <span>Branch Subtopics</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Concept Leaves</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-indigo-500 inline-block" />
                    <span>Explicit Relation</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 border-b border-dashed border-indigo-400 inline-block" />
                    <span>Inferred Relation</span>
                  </div>
                  <span className="text-[11px] opacity-75">Tip: Drag nodes to rearrange</span>
                </div>
              </div>
            </div>

            {/* Selected Node Details Drawer */}
            {selectedNode && (
              <div className="p-5 rounded-2xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-md flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border-glass">
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-indigo-400 font-bold">
                      Selected Entity
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
                    <span className="font-label-sm text-label-sm text-on-surface-variant capitalize">
                      {selectedNode.status}
                    </span>
                    {selectedNode.id === centralNodeId && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Central Topic
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNode(null)}
                    className="text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
                    {selectedNode.name}
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                    {selectedNode.description}
                  </p>
                </div>

                {/* Grounded Source References */}
                {selectedNode.source_evidence_ids && selectedNode.source_evidence_ids.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border-glass">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                      Source References:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {evidenceFor(selectedNode.source_evidence_ids).map((ev, i) => (
                        <a
                          key={ev.evidence_id}
                          href={learningSourceUrl(ev)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-base border border-border-glass text-indigo-400 text-xs hover:border-indigo-500/50"
                        >
                          <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                          <span>
                            {ev.filename} {ev.page_number ? `• Page ${ev.page_number}` : `• Ref ${i + 1}`}
                          </span>
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
