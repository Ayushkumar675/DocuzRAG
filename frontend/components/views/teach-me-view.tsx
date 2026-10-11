"use client";

import { useState } from "react";
import SourceDocSelector from "../source-doc-selector";
import { Document, LearningArtifact, LearningEvidence, LearningGenerateInput, learningSourceUrl, TeachAnswer } from "../../lib/api";

interface TeachMeViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  artifact: LearningArtifact | null;
  loading: boolean;
  ready: boolean;
  teachAnswers: Record<string, TeachAnswer>;
  onGenerate: (level: LearningGenerateInput["level"], topic?: string, regenerate?: boolean, selectedDocIds?: string[]) => void;
  onSubmitCheck: (checkId: string, answer: number) => Promise<void>;
  onNavigateUpload?: () => void;
}

export default function TeachMeView({
  collectionId,
  documents,
  selectedDocId,
  onSelectDocId,
  selectedDocIds,
  onSelectDocIds,
  artifact,
  loading,
  ready,
  teachAnswers,
  onGenerate,
  onSubmitCheck,
  onNavigateUpload,
}: TeachMeViewProps) {
  const [level, setLevel] = useState<LearningGenerateInput["level"]>("beginner");
  const [topic, setTopic] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submittingCheck, setSubmittingCheck] = useState<Record<string, boolean>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);

  const realSections = artifact?.content?.lesson_sections ?? [];
  const realChecks = artifact?.content?.understanding_checks ?? [];
  const objectives = artifact?.content?.learning_objectives ?? [];
  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  const handleSpeak = (textToSpeak: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col w-full relative pb-16">
      {/* Ambient background glows */}
      <div className="absolute -top-10 left-1/4 w-96 h-64 bg-indigo-600/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-20 right-1/6 w-80 h-72 bg-purple-600/10 dark:bg-purple-600/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Page Header */}
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-400 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
            Interactive Tutoring
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Adaptive Explanations &amp; Micro-Checks
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-text-crisp-white tracking-tight font-bold">
          Teach Me
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Learn complex technical concepts tailored to your knowledge level. Select a document, choose your depth, and test your understanding.
        </p>
      </div>

      {/* Source Document & Level Selector Bar */}
      <SourceDocSelector
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDocId={onSelectDocId}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={onSelectDocIds}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (optional, e.g. Backpropagation, Optimization)..."
        onGenerate={() => onGenerate(level, topic.trim(), Boolean(artifact), selectedDocIds)}
        generateLabel={artifact ? "Regenerate Lesson" : "Generate Lesson"}
        loading={loading}
        disabled={!ready}
        extraControls={
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-indigo-400">school</span>
              Teaching Level
            </label>
            <div className="flex items-center bg-surface-base p-1 rounded-xl border border-border-glass">
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  disabled={loading}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                    level === lvl
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Main Studio Grid */}
      {loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-indigo-400 animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Crafting adaptive {level} lesson with grounded understanding checks...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Synthesizing core mental models and verified citations
          </span>
        </div>
      ) : !artifact ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">school</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Lesson Generated Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload your documents to generate structured adaptive lessons."
                : "Select your source document and teaching level above, then click Generate Lesson."}
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
              onClick={() => onGenerate(level, topic.trim(), false, selectedDocIds)}
              disabled={!ready || documents.length === 0}
              className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-title-md text-title-md shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              Generate Lesson →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Learning Objectives & Context (4 Cols) */}
          <aside className="lg:col-span-4 flex flex-col gap-4">
            <div className="p-5 rounded-2xl bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-lg flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-border-glass mb-3">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  Learning Objectives
                </span>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 capitalize font-semibold">
                  {level}
                </span>
              </div>

              {objectives.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {objectives.map((obj: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-emerald-400 mt-0.5 shrink-0">
                        check_circle
                      </span>
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-on-surface-variant">Master core principles through progressive modules.</p>
              )}
            </div>

            {/* Context Document Card */}
            {selectedDoc && (
              <div className="p-4 bg-surface-elevated/90 border border-border-glass rounded-2xl shadow-md flex flex-col gap-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                  Grounded Source
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

          {/* Right Main Interactive Tutorial Stage (8 Cols) */}
          <main className="lg:col-span-8 flex flex-col gap-4">
            <article className="bg-surface-elevated/95 border border-border-glass rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 backdrop-blur-xl relative">
              {/* Header of Lesson */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-md">
                    <span className="material-symbols-outlined text-[22px]">lightbulb</span>
                  </div>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-text-crisp-white tracking-tight font-bold">
                      {artifact.content?.title || "Lesson"}
                    </h2>
                    <div className="font-body-sm text-body-sm text-on-surface-variant capitalize">
                      {level} Tutorial • Source-Grounded Lesson
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    aria-label="Listen to Audio Explanation"
                    onClick={() => {
                      const allText = realSections.map((s: any) => `${s.heading}. ${s.content}`).join(". ");
                      handleSpeak(allText || "Lesson content");
                    }}
                    className={`w-9 h-9 rounded-xl bg-surface-base border border-border-glass flex items-center justify-center transition-colors ${
                      isSpeaking ? "text-indigo-400 bg-indigo-500/20" : "text-on-surface-variant hover:text-text-crisp-white"
                    }`}
                    title={isSpeaking ? "Stop Speaking" : "Listen Audio Synthesis"}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isSpeaking ? "stop" : "volume_up"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Lesson Sections */}
              {realSections.map((sec: any) => (
                <div key={sec.id || sec.heading} className="flex flex-col gap-2">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-indigo-400 font-bold">
                    {sec.heading}
                  </span>
                  <div className="p-4 bg-indigo-950/20 dark:bg-indigo-950/40 border border-indigo-500/20 rounded-xl">
                    <p className="font-body-lg text-body-lg text-on-surface leading-relaxed whitespace-pre-line">
                      {sec.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Check Your Understanding Micro-Checks */}
              {realChecks.map((check: any) => {
                const response = teachAnswers[check.id];
                const selectedOpt = selectedAnswers[check.id];
                const isSubmitting = submittingCheck[check.id] ?? false;

                return (
                  <div key={check.id} className="flex flex-col gap-3 pt-2 border-t border-border-glass">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-indigo-400">quiz</span>
                        <h3 className="font-headline-sm text-headline-sm text-text-crisp-white font-bold">
                          Check Your Understanding
                        </h3>
                      </div>
                      <span className="font-label-sm text-label-sm text-indigo-400 font-semibold uppercase tracking-wider">
                        Interactive Micro-Check
                      </span>
                    </div>

                    <div className="p-5 bg-surface-base border border-border-glass rounded-xl flex flex-col gap-4">
                      <p className="font-title-md text-title-md text-text-crisp-white">{check.question}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {check.options.map((opt: string, optIdx: number) => {
                          const isSelected = selectedOpt === optIdx;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => setSelectedAnswers((prev) => ({ ...prev, [check.id]: optIdx }))}
                              type="button"
                              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                                isSelected
                                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold shadow-sm"
                                  : "bg-surface-elevated border-border-glass text-on-surface hover:border-indigo-500/40"
                              }`}
                            >
                              <span className="text-sm">{opt}</span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-indigo-400 text-[18px]">
                                  check_circle
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={async () => {
                          if (selectedOpt === undefined) return;
                          setSubmittingCheck((prev) => ({ ...prev, [check.id]: true }));
                          await onSubmitCheck(check.id, selectedOpt);
                          setSubmittingCheck((prev) => ({ ...prev, [check.id]: false }));
                        }}
                        disabled={selectedOpt === undefined || isSubmitting}
                        type="button"
                        className="self-start px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-label-md text-label-md disabled:opacity-50 transition-all shadow-md"
                      >
                        {isSubmitting ? "Checking…" : "Verify Answer"}
                      </button>

                      {response && (
                        <div
                          className={`p-4 rounded-xl border ${
                            response.correct
                              ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                              : "bg-rose-950/30 border-rose-500/40 text-rose-300"
                          }`}
                        >
                          <div className="font-bold mb-1">
                            {response.correct
                              ? "✓ Correct!"
                              : `✗ Not quite. Correct answer: ${check.options[response.correct_answer]}`}
                          </div>
                          <p className="text-sm opacity-90">{response.feedback}</p>
                          {response.next_step && (
                            <p className="text-xs mt-1 text-on-surface-variant font-medium">{response.next_step}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Citations Footer */}
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
