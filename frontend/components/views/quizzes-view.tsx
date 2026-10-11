"use client";

import React, { useState, useEffect } from "react";
import SourceDocSelector from "../source-doc-selector";
import {
  Document,
  generateLearning,
  submitQuiz,
  LearningArtifact,
  QuizSubmission,
  learningSourceUrl,
} from "../../lib/api";

interface QuizzesViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  isReady: boolean;
  onNavigateUpload?: () => void;
}

export default function QuizzesView({
  collectionId,
  documents,
  selectedDocIds,
  onSelectDocIds,
  selectedDocId,
  onSelectDocId,
  isReady,
  onNavigateUpload,
}: QuizzesViewProps) {
  const [artifact, setArtifact] = useState<LearningArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submission, setSubmission] = useState<QuizSubmission | null>(null);
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});

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

  // Form controls
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState(10);
  const [questionType, setQuestionType] = useState<"mixed" | "single_choice" | "true_false">("mixed");

  // Live timer
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!artifact || submission) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [artifact, submission]);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const questions = artifact?.content?.questions ?? [];
  const currentQuestion = questions[currentQIndex] ?? null;

  async function handleGenerate(regenerate = false) {
    if (!collectionId || !isReady || loading || documents.length === 0) return;
    if (effectiveDocIds.length === 0) {
      setError("Please select at least 1 source document to generate the quiz.");
      return;
    }
    setLoading(true);
    setError("");
    setSubmission(null);
    setAnswers({});
    setCurrentQIndex(0);
    setSeconds(0);
    try {
      const selectedScope = effectiveDocIds.length > 0 ? effectiveDocIds : null;
      const res = await generateLearning("quizzes", {
        collection_id: collectionId,
        selected_document_ids: selectedScope,
        topic: topic.trim(),
        difficulty,
        level: "beginner",
        count,
        format: "quick_revision",
        question_type: questionType,
        regenerate,
      });
      setArtifact(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!artifact || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const selectedScope =
        artifact.selected_document_ids && artifact.selected_document_ids.length > 0
          ? artifact.selected_document_ids
          : effectiveDocIds.length > 0
          ? effectiveDocIds
          : [];
      const result = await submitQuiz(
        artifact.id,
        collectionId,
        selectedScope,
        answers
      );
      setSubmission(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = Object.keys(answers).length;
  const progressPercent = questions.length > 0 ? Math.round(((currentQIndex + 1) / questions.length) * 100) : 0;

  return (
    <div className="relative w-full pb-16">
      {/* Ambient Glow Orbs */}
      <div className="absolute -top-10 left-1/3 w-96 h-96 bg-primary-fixed/30 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-48 right-12 w-80 h-80 bg-secondary-fixed/30 dark:bg-purple-900/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Page Header */}
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <div className="flex items-center gap-space-xs text-indigo-400 mb-1">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">
            Adaptive Evaluation
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface dark:text-text-crisp-white font-bold">
          Quizzes
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Evaluate your understanding with grounded, multiple-choice questions scored deterministically with source-level feedback.
        </p>
      </div>

      {/* Source Document & Settings Selector */}
      <SourceDocSelector
        documents={documents}
        selectedDocIds={effectiveDocIds}
        onSelectDocIds={handleDocIdsChange}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (optional, e.g. Backpropagation, Optimization)..."
        onGenerate={() => handleGenerate(Boolean(artifact))}
        generateLabel={artifact ? "Regenerate Quiz" : "Generate Quiz"}
        loading={loading}
        disabled={!isReady}
        extraControls={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col gap-1 min-w-[110px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                disabled={loading}
                className="pl-3 pr-6 py-2 rounded-xl bg-surface-base dark:bg-slate-900 text-on-surface dark:text-slate-100 font-label-md text-label-md border border-border-glass cursor-pointer"
              >
                <option value="easy" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Easy</option>
                <option value="medium" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Medium</option>
                <option value="hard" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Hard</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Question Type
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as any)}
                disabled={loading}
                className="pl-3 pr-6 py-2 rounded-xl bg-surface-base dark:bg-slate-900 text-on-surface dark:text-slate-100 font-label-md text-label-md border border-border-glass cursor-pointer"
              >
                <option value="mixed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Mixed Types</option>
                <option value="single_choice" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Multiple Choice (4 Options)</option>
                <option value="true_false" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">True / False</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[110px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Questions
              </label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={loading}
                className="pl-3 pr-6 py-2 rounded-xl bg-surface-base dark:bg-slate-900 text-on-surface dark:text-slate-100 font-label-md text-label-md border border-border-glass cursor-pointer"
              >
                <option value={4} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">4 Questions</option>
                <option value={6} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">6 Questions</option>
                <option value={10} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">10 Questions</option>
                <option value={20} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">20 Questions</option>
              </select>
            </div>
          </div>
        }
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
      {!artifact && !loading ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-secondary-fixed dark:bg-purple-500/20 text-secondary dark:text-purple-300 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">quiz</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Quiz Generated Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload your documents to synthesize rigorous practice quizzes."
                : "Select a source document and enter an optional topic above, then click Generate Quiz."}
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
              Generate Practice Quiz →
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-indigo-400 animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Drafting question matrix and validating deterministic scoring keys...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Anchoring each distractor and correct answer in document evidence
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Question Navigator Matrix (Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="p-5 rounded-2xl bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-border-glass">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-[20px]">timer</span>
                  <span className="font-title-md text-title-md text-text-crisp-white font-mono font-bold">
                    {formatTimer(seconds)}
                  </span>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-base text-on-surface-variant border border-border-glass">
                  {answeredCount} / {questions.length} Answered
                </span>
              </div>

              {/* Grid of Question Number Buttons */}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q: any, idx: number) => {
                  const isCurrent = currentQIndex === idx;
                  const isAnswered = answers[q.id] !== undefined;
                  const isFlag = flagged[idx];

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentQIndex(idx)}
                      className={`h-10 rounded-xl font-title-md text-title-md flex items-center justify-center relative transition-all ${
                        isCurrent
                          ? "bg-indigo-600 text-white shadow-md font-bold ring-2 ring-indigo-400/50"
                          : isAnswered
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-surface-base text-on-surface-variant hover:text-text-crisp-white"
                      }`}
                    >
                      <span>{idx + 1}</span>
                      {isFlag && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Score Results Card if Submitted */}
              {submission && (
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/40 flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wider font-bold text-indigo-400">
                    Evaluation Result
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-text-crisp-white">
                      {submission.score} / {submission.total}
                    </span>
                    <span className="text-xl font-bold text-emerald-400">
                      {submission.percentage}%
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    Deterministic Python score. Grounded citations verified.
                  </span>
                </div>
              )}

              {/* Submit Quiz Button */}
              {!submission && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || answeredCount === 0}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-title-md text-title-md shadow-md transition-all mt-2"
                >
                  {submitting ? "Scoring..." : `Submit Quiz (${answeredCount}/${questions.length})`}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Question Stage & Answer Selection (Span 8) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {currentQuestion && (
              <div className="p-6 md:p-8 rounded-3xl bg-surface-elevated/90 border border-border-glass backdrop-blur-xl shadow-2xl flex flex-col gap-6">
                {/* Question Header */}
                <div className="flex items-center justify-between pb-4 border-b border-border-glass">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                      Question {currentQIndex + 1} of {questions.length}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 dark:text-indigo-300 border border-indigo-400/30">
                      {currentQuestion.type === "true_false" ? "True / False" : "Multiple Choice"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlagged((f) => ({ ...f, [currentQIndex]: !f[currentQIndex] }))}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      flagged[currentQIndex]
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-surface-base text-on-surface-variant border-border-glass"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">flag</span>
                    <span>{flagged[currentQIndex] ? "Flagged" : "Flag for Review"}</span>
                  </button>
                </div>

                {/* Question Prompt */}
                <h3 className="font-headline-md text-headline-md text-text-crisp-white font-bold leading-relaxed">
                  {currentQuestion.question}
                </h3>

                {/* Options List */}
                <div className="flex flex-col gap-3">
                  {currentQuestion.options.map((opt: string, optIdx: number) => {
                    const isSelected = answers[currentQuestion.id] === optIdx;
                    const review = submission?.review?.find((r) => r.id === currentQuestion.id);
                    const isCorrect = review?.correct_answer === optIdx;
                    const isWrongChosen = review && !review.correct && isSelected;

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          if (submission) return;
                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optIdx }));
                        }}
                        disabled={Boolean(submission)}
                        className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                          isCorrect
                            ? "bg-emerald-950/40 border-emerald-500 text-emerald-300 font-semibold"
                            : isWrongChosen
                            ? "bg-rose-950/40 border-rose-500 text-rose-300 font-semibold"
                            : isSelected
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold shadow-sm"
                            : "bg-surface-base border-border-glass text-on-surface hover:border-indigo-500/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs uppercase ${
                              isSelected || isCorrect
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "bg-surface-elevated dark:bg-slate-800 text-on-surface-variant dark:text-slate-200 border border-border-glass"
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <span className="font-body-md text-body-md dark:text-slate-100">{opt}</span>
                        </div>
                        {isCorrect && (
                          <span className="material-symbols-outlined text-emerald-400 text-[20px]">check_circle</span>
                        )}
                        {isWrongChosen && (
                          <span className="material-symbols-outlined text-rose-400 text-[20px]">cancel</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Review Feedback if Submitted */}
                {submission && (() => {
                  const review = submission.review?.find((r) => r.id === currentQuestion.id);
                  if (!review) return null;
                  return (
                    <div
                      className={`p-4 rounded-xl border ${
                        review.correct
                          ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                          : "bg-rose-950/30 border-rose-500/40 text-rose-300"
                      }`}
                    >
                      <div className="font-bold mb-1">
                        {review.correct ? "✓ Correct!" : `✗ Incorrect. Correct: ${currentQuestion.options[review.correct_answer]}`}
                      </div>
                      <p className="text-sm opacity-90">{review.explanation}</p>
                    </div>
                  );
                })()}

                {/* Navigation Buttons: Prev and Next Question */}
                <div className="flex items-center justify-between pt-4 border-t border-border-glass">
                  <button
                    type="button"
                    onClick={() => setCurrentQIndex((i) => Math.max(0, i - 1))}
                    disabled={currentQIndex === 0}
                    className="px-4 py-2 rounded-xl bg-surface-base border border-border-glass text-on-surface hover:text-text-crisp-white disabled:opacity-40 text-sm flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentQIndex((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={currentQIndex === questions.length - 1}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 text-sm flex items-center gap-1"
                  >
                    <span>Next</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
