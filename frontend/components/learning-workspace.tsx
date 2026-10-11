"use client";

import { useMemo, useState } from "react";
import {
  answerTeach, generateLearning, LearningArtifact, LearningEvidence, LearningGenerateInput,
  LearningKind, learningSourceUrl, submitQuiz, QuizSubmission, TeachAnswer,
} from "../lib/api";

type Props = { collectionId: string; selectedDocumentIds: string[]; ready: boolean };
type Difficulty = LearningGenerateInput["difficulty"];
type Level = LearningGenerateInput["level"];

const tabs: Array<{ id: LearningKind; label: string; eyebrow: string; description: string }> = [
  { id: "knowledge-graph", label: "Knowledge Graph", eyebrow: "01", description: "Map concepts and source-traceable relationships." },
  { id: "topic-tree", label: "Topic Tree", eyebrow: "02", description: "Build a navigable outline from source structure." },
  { id: "flashcards", label: "Flashcards", eyebrow: "03", description: "Practice active recall with cited answers." },
  { id: "quizzes", label: "Quiz", eyebrow: "04", description: "Test yourself and score deterministically." },
  { id: "cheat-sheet", label: "Cheat Sheet", eyebrow: "05", description: "Turn selected evidence into compact notes." },
  { id: "teach", label: "Teach Me", eyebrow: "06", description: "Learn the same facts at your level." },
];

const formatLabels: Record<LearningGenerateInput["format"], string> = {
  quick_revision: "Quick revision", key_concepts: "Key concepts", formula_sheet: "Formula sheet",
  comparison_table: "Comparison table", exam_outline: "Exam outline", last_minute: "Last-minute notes",
};

export default function LearningWorkspace({ collectionId, selectedDocumentIds, ready }: Props) {
  const [active, setActive] = useState<LearningKind>("topic-tree");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [level, setLevel] = useState<Level>("beginner");
  const [count, setCount] = useState(6);
  const [format, setFormat] = useState<LearningGenerateInput["format"]>("quick_revision");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Per-tab state: keyed by LearningKind
  const [artifacts, setArtifacts] = useState<Partial<Record<LearningKind, LearningArtifact>>>({});
  const [quizResults, setQuizResults] = useState<Partial<Record<LearningKind, QuizSubmission>>>({});
  const [teachResults, setTeachResults] = useState<Partial<Record<LearningKind, Record<string, TeachAnswer>>>>({});
  const [answersMap, setAnswersMap] = useState<Partial<Record<LearningKind, Record<string, number>>>>({});
  const [revealedMap, setRevealedMap] = useState<Partial<Record<LearningKind, Record<string, boolean>>>>({});
  const [ratingsMap, setRatingsMap] = useState<Partial<Record<LearningKind, Record<string, string>>>>({});
  const [expandedMap, setExpandedMap] = useState<Partial<Record<LearningKind, Record<string, boolean>>>>({ "topic-tree": { "topic-root": true } });
  const [selectedNodes, setSelectedNodes] = useState<Partial<Record<LearningKind, any>>>({});

  const artifact = artifacts[active] ?? null;
  const quizResult = (quizResults[active] ?? null) as QuizSubmission | null;
  const teachAnswers = teachResults[active] ?? {};
  const answers = answersMap[active] ?? {};
  const revealed = revealedMap[active] ?? {};
  const ratings = ratingsMap[active] ?? {};
  const expandedTopics = expandedMap[active] ?? { "topic-root": true };
  const selectedNode = selectedNodes[active] ?? null;

  const selectedScope = selectedDocumentIds.length ? selectedDocumentIds : [];
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const canGenerate = Boolean(collectionId && ready && !loading);

  function selectTab(kind: LearningKind) {
    setActive(kind); setError("");
  }

  async function generate(regenerate = false) {
    if (!canGenerate) return;
    setLoading(true); setError("");
    setQuizResults(prev => ({ ...prev, [active]: undefined }));
    setTeachResults(prev => ({ ...prev, [active]: {} }));
    setAnswersMap(prev => ({ ...prev, [active]: {} }));
    try {
      const input: LearningGenerateInput = {
        collection_id: collectionId, selected_document_ids: selectedScope.length ? selectedScope : null,
        topic: topic.trim(), difficulty, level, count, format, regenerate,
      };
      const result = await generateLearning(active, input);
      setArtifacts(prev => ({ ...prev, [active]: result }));
      setRevealedMap(prev => ({ ...prev, [active]: {} }));
      setRatingsMap(prev => ({ ...prev, [active]: {} }));
      setExpandedMap(prev => ({ ...prev, [active]: { "topic-root": true } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not generate this learning activity."); }
    finally { setLoading(false); }
  }

  function evidenceFor(ids: string[]) {
    return (artifact?.evidence ?? []).filter((item) => ids.includes(item.evidence_id));
  }

  return (
    <section className="learning-workspace" aria-labelledby="learning-heading">
      <div className="learning-heading">
        <div><p className="eyebrow">LEARNING WORKSPACE / 05</p><h2 id="learning-heading">Learn from the evidence.</h2><p className="learning-copy">Generate one focused activity at a time. Every supported claim stays linked to the selected source scope.</p></div>
        <div className="learning-scope-badge">{selectedScope.length ? `${selectedScope.length} selected sources` : "All collection sources"}</div>
      </div>
      <nav className="learning-tabs" aria-label="Learning activities">
        {tabs.map((tab) => <button type="button" className={active === tab.id ? "learning-tab active" : "learning-tab"} key={tab.id} onClick={() => selectTab(tab.id)}><span>{tab.eyebrow}</span><strong>{tab.label}</strong></button>)}
      </nav>
      <div className="learning-control-bar">
        <div className="learning-control-main"><label htmlFor="learning-topic">Topic <small>optional — leave blank for the selected scope</small></label><input id="learning-topic" value={topic} disabled={!ready || loading} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. supervised learning, revenue recognition" /></div>
        {(active === "flashcards" || active === "quizzes") && <div><label htmlFor="learning-difficulty">Difficulty</label><select id="learning-difficulty" value={difficulty} disabled={loading} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>}
        {active === "teach" && <div><label htmlFor="learning-level">Teaching level</label><select id="learning-level" value={level} disabled={loading} onChange={(event) => setLevel(event.target.value as Level)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>}
        {(active === "flashcards" || active === "quizzes") && <div><label htmlFor="learning-count">Count</label><select id="learning-count" value={count} disabled={loading} onChange={(event) => setCount(Number(event.target.value))}><option value="4">4</option><option value="6">6</option><option value="10">10</option><option value="20">20</option></select></div>}
        {active === "cheat-sheet" && <div><label htmlFor="learning-format">Format</label><select id="learning-format" value={format} disabled={loading} onChange={(event) => setFormat(event.target.value as LearningGenerateInput["format"])}>{Object.entries(formatLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>}
        <button type="button" className="primary-button learning-generate" disabled={!canGenerate} onClick={() => void generate()}>{loading ? "Grounding…" : `Generate ${activeTab.label} →`}</button>
      </div>
      {!ready && <div className="learning-empty">Prepare and index the selected documents before generating a learning activity.</div>}
      {error && <div className="alert" role="alert">{error}<button type="button" className="retry-link" onClick={() => void generate(true)}>Retry generation</button></div>}
      {loading && <div className="learning-loading"><span className="spinner-dot" /><div><strong>Retrieving evidence → validating scope → generating → verifying</strong><p>Learning content is only shown after its citations and structure pass validation.</p></div></div>}
      {!loading && artifact && <>
        {artifact.warnings.map((warning) => <div className="learning-warning" key={warning}>{warning}</div>)}
        {active === "knowledge-graph" && <GraphView artifact={artifact} selectedNode={selectedNode} setSelectedNode={(n) => setSelectedNodes(prev => ({ ...prev, [active]: n }))} evidenceFor={evidenceFor} />}
        {active === "topic-tree" && <TopicView artifact={artifact} expanded={expandedTopics} setExpanded={(e) => setExpandedMap(prev => ({ ...prev, [active]: e }))} setTopic={setTopic} />}
        {active === "flashcards" && <FlashcardView artifact={artifact} revealed={revealed} setRevealed={(r) => setRevealedMap(prev => ({ ...prev, [active]: r }))} ratings={ratings} setRatings={(r) => setRatingsMap(prev => ({ ...prev, [active]: r }))} evidenceFor={evidenceFor} />}
        {active === "quizzes" && <QuizView artifact={artifact} answers={answers} setAnswers={(a) => setAnswersMap(prev => ({ ...prev, [active]: a }))} result={quizResult} submit={async () => { setLoading(true); setError(""); try { const r = await submitQuiz(artifact.id, collectionId, selectedScope, answers); setQuizResults(prev => ({ ...prev, [active]: r })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Quiz submission failed."); } finally { setLoading(false); } }} />}
        {active === "cheat-sheet" && <CheatSheetView artifact={artifact} evidenceFor={evidenceFor} />}
        {active === "teach" && <TeachView artifact={artifact} answers={teachAnswers} submit={async (checkId: string, answer: number) => { setLoading(true); setError(""); try { const r = await answerTeach(artifact.id, collectionId, selectedScope, checkId, answer); setTeachResults(prev => ({ ...prev, [active]: { ...(prev[active] ?? {}), [checkId]: r } })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Lesson check failed."); } finally { setLoading(false); } }} evidenceFor={evidenceFor} />}
        <div className="learning-actions"><button type="button" className="secondary-button" onClick={() => void generate(true)}>Regenerate</button><span>Content is cached for the current source version; regenerate after changing the topic or scope.</span></div>
      </>}
      {!loading && !artifact && ready && <div className="learning-empty"><span className="empty-icon">✦</span><strong>{activeTab.label}</strong><p>{activeTab.description} Set an optional topic, then generate a grounded activity.</p></div>}
    </section>
  );
}

function EvidenceLinks({ ids, evidence }: { ids: string[]; evidence: LearningEvidence[] }) {
  const matches = evidence.filter((item) => ids.includes(item.evidence_id));
  return <div className="learning-evidence-links">{matches.length ? matches.map((item, index) => <a href={learningSourceUrl(item)} target="_blank" rel="noopener noreferrer" key={item.evidence_id}>{item.filename}{item.page_number ? ` · p.${item.page_number}` : ""} · Source {index + 1} ↗</a>) : <span>No source reference available.</span>}</div>;
}

function GraphView({ artifact, selectedNode, setSelectedNode, evidenceFor }: { artifact: LearningArtifact; selectedNode: any; setSelectedNode: (value: any) => void; evidenceFor: (ids: string[]) => LearningEvidence[] }) {
  const allNodes = artifact.content.nodes ?? [];
  const allEdges = artifact.content.edges ?? [];
  const [zoom, setZoom] = useState(allNodes.length > 20 ? 0.85 : 1);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  // Detect distinct batches (e.g. b0, b1 from per-source generation)
  const batches = useMemo(() => {
    const set = new Set<string>();
    allNodes.forEach((node: any) => {
      const match = node.id.match(/^b(\d+)-/);
      if (match) set.add(match[1]);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [allNodes]);

  const nodes = useMemo(() => {
    if (!selectedBatch) return allNodes;
    return allNodes.filter((n: any) => n.id.startsWith(`b${selectedBatch}-`));
  }, [allNodes, selectedBatch]);

  const activeNodeIds = useMemo(() => new Set(nodes.map((n: any) => n.id)), [nodes]);

  const edges = useMemo(() => {
    return allEdges.filter((e: any) => activeNodeIds.has(e.source_node_id) && activeNodeIds.has(e.target_node_id));
  }, [allEdges, activeNodeIds]);

  // Layout calculation
  const cols = nodes.length > 28 ? 6 : nodes.length > 15 ? 5 : Math.max(3, Math.min(4, nodes.length));
  const colWidth = nodes.length > 28 ? 180 : 205;
  const rowHeight = nodes.length > 28 ? 115 : 125;
  const nodeRadius = nodes.length > 28 ? 26 : 30;

  const nodePosition = (index: number) => ({
    x: 60 + (index % cols) * colWidth,
    y: 55 + Math.floor(index / cols) * rowHeight,
  });

  const positions = useMemo(() => {
    return Object.fromEntries(nodes.map((node: any, index: number) => [node.id, nodePosition(index)]));
  }, [nodes, cols, colWidth, rowHeight]);

  const svgWidth = Math.max(860, 80 + cols * colWidth);
  const svgHeight = Math.max(260, 90 + Math.ceil(nodes.length / cols) * rowHeight);

  const batchPalette = ["#d7f36b", "#93c5fd", "#fde047", "#fca5a5", "#c4b5fd", "#6ee7b7"];
  function getNodeColor(nodeId: string) {
    const match = nodeId.match(/^b(\d+)-/);
    if (!match) return "var(--acid)";
    return batchPalette[Number(match[1]) % batchPalette.length];
  }

  return (
    <div className="learning-result-grid">
      <div className="graph-card">
        <div className="result-toolbar" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div>
            <strong>{artifact.content.title}</strong>
            <span style={{ marginLeft: "10px" }}>
              {nodes.length} concepts · {edges.length} relationships
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {batches.length > 1 && (
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  className={selectedBatch === null ? "rating active" : "rating"}
                  onClick={() => setSelectedBatch(null)}
                >
                  All Sources
                </button>
                {batches.map((b) => (
                  <button
                    type="button"
                    key={b}
                    className={selectedBatch === b ? "rating active" : "rating"}
                    onClick={() => setSelectedBatch(b)}
                  >
                    Source {Number(b) + 1}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "6px" }}>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "3px 8px", fontSize: "11px" }}
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
                title="Zoom Out"
              >
                −
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "3px 8px", fontSize: "10px" }}
                onClick={() => setZoom(1)}
                title="Reset Zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "3px 8px", fontSize: "11px" }}
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                title="Zoom In"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div
          className="graph-canvas-container"
          style={{
            maxHeight: "540px",
            overflow: "auto",
            marginTop: "12px",
            background: "#f4f7ef",
            border: "1px solid var(--line)",
            borderRadius: "9px",
            position: "relative",
          }}
        >
          <svg
            className="graph-canvas"
            style={{
              width: `${svgWidth * zoom}px`,
              height: `${svgHeight * zoom}px`,
              minWidth: "100%",
              margin: 0,
              border: "none",
              background: "transparent",
            }}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label="Knowledge graph visualization"
          >
            <defs>
              <marker
                id="graph-arrow"
                viewBox="0 0 10 10"
                refX="26"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#889688" />
              </marker>
            </defs>

            {edges.map((edge: any) => {
              const from = positions[edge.source_node_id];
              const to = positions[edge.target_node_id];
              if (!from || !to) return null;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              return (
                <g key={edge.id}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className="graph-edge"
                    markerEnd="url(#graph-arrow)"
                  />
                  <rect
                    x={midX - 35}
                    y={midY - 9}
                    width={70}
                    height={14}
                    fill="#f4f7ef"
                    rx={4}
                    opacity={0.88}
                  />
                  <text
                    x={midX}
                    y={midY + 2}
                    className="graph-edge-label"
                    style={{ fontSize: "9px" }}
                  >
                    {edge.relation.slice(0, 18)}
                  </text>
                  <title>{`${edge.relation} (${edge.status})`}</title>
                </g>
              );
            })}

            {nodes.map((node: any) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const isSelected = selectedNode?.id === node.id;
              return (
                <g
                  className="graph-node"
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedNode(node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelectedNode(node);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius}
                    fill={getNodeColor(node.id)}
                    stroke={isSelected ? "var(--coral)" : "var(--ink)"}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 2}
                    style={{ fontSize: "10px", fontWeight: 600 }}
                  >
                    {node.name.slice(0, 15)}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 12}
                    className="graph-node-status"
                    style={{ fontSize: "7px" }}
                  >
                    {node.status}
                  </text>
                  <title>{`${node.name} (${node.status})\n${node.description}`}</title>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="graph-list">
          {edges.map((edge: any) => (
            <div key={edge.id}>
              <span className="inferred-tag">{edge.status}</span>{" "}
              {allNodes.find((node: any) => node.id === edge.source_node_id)?.name} <strong>{edge.relation}</strong>{" "}
              {allNodes.find((node: any) => node.id === edge.target_node_id)?.name}
              <EvidenceLinks ids={edge.source_evidence_ids} evidence={artifact.evidence} />
            </div>
          ))}
        </div>
      </div>

      {selectedNode ? (
        <aside className="learning-detail">
          <p className="eyebrow">SELECTED CONCEPT</p>
          <h3>{selectedNode.name}</h3>
          <p>{selectedNode.description}</p>
          <EvidenceLinks
            ids={selectedNode.source_evidence_ids}
            evidence={evidenceFor(selectedNode.source_evidence_ids)}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedNode(null)}
          >
            Close detail
          </button>
        </aside>
      ) : (
        <aside className="learning-detail">
          <p className="eyebrow">HOW TO READ IT</p>
          <h3>Click a node</h3>
          <p>
            Explicit concepts come from source-grounded extraction. Relationships
            marked inferred are useful study connections, not direct quotations from
            the document.
          </p>
        </aside>
      )}
    </div>
  );
}

function TopicView({ artifact, expanded, setExpanded, setTopic }: { artifact: LearningArtifact; expanded: Record<string, boolean>; setExpanded: (value: Record<string, boolean>) => void; setTopic: (value: string) => void }) {
  const nodes = artifact.content.nodes ?? [];
  const children = (parentId: string | null) => nodes.filter((node: any) => node.parent_id === parentId).sort((a: any, b: any) => a.sort_order - b.sort_order);
  function render(parentId: string | null) { return children(parentId).map((node: any) => <li key={node.id}><div className="topic-row"><button type="button" className="topic-toggle" onClick={() => setExpanded({ ...expanded, [node.id]: !expanded[node.id] })}>{children(node.id).length ? (expanded[node.id] ? "−" : "+") : "·"}</button><button type="button" className="topic-select" onClick={() => { setTopic(node.title); setExpanded({ ...expanded, [node.id]: !expanded[node.id] }); }}><strong>{node.title}</strong>{node.inferred && <span className="inferred-tag">inferred</span>}</button></div>{expanded[node.id] && <><p className="topic-summary">{node.summary}</p>{render(node.id)}</>}</li>); }
  return <div className="topic-result"><div className="result-toolbar"><strong>{artifact.content.title}</strong><span>Click a topic title to use it for the next activity.</span></div><ul className="topic-tree-list">{render(null)}</ul><div className="learning-shortcuts"><span>Selected topic workflows</span><button type="button" className="secondary-button" onClick={() => setTopic(topicFromTree(nodes))}>Use root topic</button><span className="muted">After selecting a topic, choose Flashcards, Quiz, Cheat Sheet, or Teach Me above.</span></div></div>;
}
function topicFromTree(nodes: any[]) { return nodes.find((node) => node.parent_id === null)?.title ?? ""; }

function FlashcardView({ artifact, revealed, setRevealed, ratings, setRatings, evidenceFor }: { artifact: LearningArtifact; revealed: Record<string, boolean>; setRevealed: (value: Record<string, boolean>) => void; ratings: Record<string, string>; setRatings: (value: Record<string, string>) => void; evidenceFor: (ids: string[]) => LearningEvidence[] }) {
  const cards = artifact.content.cards ?? [];
  return <div className="study-grid">{cards.map((card: any) => 
    <article className={revealed[card.id] ? "study-card revealed" : "study-card"} key={card.id}>
      <div className="study-card-inner" onClick={() => setRevealed({ ...revealed, [card.id]: !revealed[card.id] })}>
        <div className="study-card-front">
          <span className="difficulty-tag">{card.difficulty}</span>
          <h3>{card.question}</h3>
          <p className="muted" style={{ marginTop: 'auto', textAlign: 'center', fontSize: '11px' }}>Click to flip</p>
        </div>
        <div className="study-card-back">
          <span className="difficulty-tag">{card.difficulty}</span>
          <div className="study-answer" style={{ borderTop: "none", paddingTop: 0, marginTop: "-18px" }} onClick={(e) => e.stopPropagation()}>
            <strong>{card.answer}</strong>
            <p>{card.explanation}</p>
            <EvidenceLinks ids={card.source_evidence_ids} evidence={evidenceFor(card.source_evidence_ids)} />
          </div>
          {revealed[card.id] && <div className="rating-row" style={{ marginTop: 'auto' }}>
            <span>How did it feel?</span>
            {["Again", "Hard", "Good", "Easy"].map((rating) => 
              <button type="button" className={ratings[card.id] === rating ? "rating active" : "rating"} key={rating} onClick={(e) => { e.stopPropagation(); setRatings({ ...ratings, [card.id]: rating }); }}>
                {rating}
              </button>
            )}
          </div>}
        </div>
      </div>
    </article>
  )}</div>;
}

function QuizView({ artifact, answers, setAnswers, result, submit }: { artifact: LearningArtifact; answers: Record<string, number>; setAnswers: (value: Record<string, number>) => void; result: QuizSubmission | null; submit: () => void }) {
  const questions = artifact.content.questions ?? [];
  return <div className="quiz-result"><div className="result-toolbar"><strong>{artifact.content.title}</strong><span>{result ? `${result.score}/${result.total} · ${result.percentage}%` : "Answers stay hidden until submission."}</span></div>{questions.map((question: any, index: number) => <article className="quiz-question" key={question.id}><span className="question-number">{String(index + 1).padStart(2, "0")}</span><h3>{question.question}</h3><div className="option-list">{question.options.map((option: string, optionIndex: number) => <label key={option}><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} disabled={Boolean(result)} onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })} /><span>{option}</span></label>)}</div>{result && (() => { const reviewed = result.review.find((item) => item.id === question.id); return reviewed ? <div className={reviewed.correct ? "quiz-feedback correct" : "quiz-feedback incorrect"}><strong>{reviewed.correct ? "Correct" : `Correct answer: ${question.options[reviewed.correct_answer]}`}</strong><p>{reviewed.explanation}</p><EvidenceLinks ids={reviewed.source_evidence_ids} evidence={result.evidence} /></div> : null; })()}</article>)}{!result ? <button type="button" className="primary-button" disabled={!questions.length || Object.keys(answers).length !== questions.length} onClick={submit}>Submit and review →</button> : <p className="muted">Scoring is deterministic Python evaluation. Try Regenerate for a new quiz.</p>}</div>;
}

function CheatSheetView({ artifact, evidenceFor }: { artifact: LearningArtifact; evidenceFor: (ids: string[]) => LearningEvidence[] }) { return <article className="cheat-sheet-result"><div className="result-toolbar"><strong>{artifact.content.title}</strong><button type="button" className="secondary-button" onClick={() => window.print()}>Print / export</button></div>{(artifact.content.sections ?? []).map((section: any) => <section className="sheet-section" key={section.heading}><h3>{section.heading}</h3><div className="sheet-content">{section.content.split("\n").map((line: string) => <p key={line}>{line}</p>)}</div><EvidenceLinks ids={section.source_evidence_ids} evidence={evidenceFor(section.source_evidence_ids)} /></section>)}</article>; }

function TeachView({ artifact, answers, submit, evidenceFor }: { artifact: LearningArtifact; answers: Record<string, TeachAnswer>; submit: (checkId: string, answer: number) => void; evidenceFor: (ids: string[]) => LearningEvidence[] }) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const checks = artifact.content.understanding_checks ?? [];
  return <div className="teach-result"><div className="lesson-intro"><span className="difficulty-tag">{artifact.parameters.level}</span><h3>{artifact.content.title}</h3><ul>{(artifact.content.learning_objectives ?? []).map((objective: string) => <li key={objective}>{objective}</li>)}</ul></div>{(artifact.content.lesson_sections ?? []).map((section: any) => <section className="lesson-section" key={section.id}><p className="eyebrow">{section.heading}</p><p>{section.content}</p><EvidenceLinks ids={section.source_evidence_ids} evidence={evidenceFor(section.source_evidence_ids)} /></section>)}{checks.map((check: any) => { const response = answers[check.id] ?? null; return <section className="understanding-check" key={check.id}><p className="eyebrow">CHECK YOUR UNDERSTANDING</p><h3>{check.question}</h3><div className="option-list">{check.options.map((option: string, index: number) => <label key={option}><input type="radio" name={check.id} checked={selected[check.id] === index} onChange={() => setSelected({ ...selected, [check.id]: index })} /><span>{option}</span></label>)}</div><button type="button" className="secondary-button" disabled={selected[check.id] === undefined} onClick={() => submit(check.id, selected[check.id])}>Check answer</button>{response && <div className={response.correct ? "quiz-feedback correct" : "quiz-feedback incorrect"}><strong>{response.correct ? "Correct" : `Correct answer: ${check.options[response.correct_answer]}`}</strong><p>{response.feedback}</p><p>{response.next_step}</p><EvidenceLinks ids={response.source_evidence_ids} evidence={response.evidence} /></div>}</section>; })}</div>;
}
