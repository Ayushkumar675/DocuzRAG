"use client";

import React, { useState, useEffect } from "react";
import SourceDocSelector from "../source-doc-selector";
import {
  Document,
  generateLearning,
  LearningArtifact,
  learningSourceUrl,
} from "../../lib/api";

interface FlashcardsViewProps {
  collectionId: string;
  documents: Document[];
  selectedDocId?: string;
  onSelectDocId?: (id: string) => void;
  selectedDocIds?: string[];
  onSelectDocIds?: (ids: string[]) => void;
  isReady: boolean;
  onNavigateUpload?: () => void;
}

export default function FlashcardsView({
  collectionId,
  documents,
  selectedDocId,
  onSelectDocId,
  selectedDocIds,
  onSelectDocIds,
  isReady,
  onNavigateUpload,
}: FlashcardsViewProps) {
  const [artifact, setArtifact] = useState<LearningArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState(10);

  const cards = artifact?.content?.cards ?? [];
  const currentCard = cards[currentIndex] ?? null;

  // Keyboard navigation: Space to flip, arrows to navigate
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cards.length, currentIndex]);

  const handleNext = () => {
    if (cards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((i) => (i + 1) % cards.length);
  };

  const handlePrev = () => {
    if (cards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((i) => (i - 1 + cards.length) % cards.length);
  };

  const handleShuffle = () => {
    if (!artifact) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setArtifact({
      ...artifact,
      content: { ...artifact.content, cards: shuffled },
    });
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setRatings({});
  };

  const handleRate = (rating: string) => {
    if (!currentCard) return;
    setRatings((prev) => ({ ...prev, [currentCard.id]: rating }));
    setTimeout(handleNext, 300);
  };

  const handleAudioReadout = () => {
    if (!currentCard || typeof window === "undefined" || !window.speechSynthesis) return;
    const textToRead = `${currentCard.question}. Answer: ${currentCard.answer}. ${currentCard.explanation || ""}`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  async function handleGenerate(regenerate = false) {
    if (!collectionId || !isReady || loading || documents.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const effectiveDocIds =
        selectedDocIds !== undefined && selectedDocIds.length > 0
          ? selectedDocIds
          : selectedDocId
          ? [selectedDocId]
          : documents.map((d) => d.id);
      const selectedScope = effectiveDocIds.length > 0 ? effectiveDocIds : null;
      const res = await generateLearning("flashcards", {
        collection_id: collectionId,
        selected_document_ids: selectedScope,
        topic: topic.trim(),
        difficulty,
        level: "beginner",
        count,
        format: "quick_revision",
        regenerate,
      });
      setArtifact(res);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards.");
    } finally {
      setLoading(false);
    }
  }

  const progressPercent = cards.length > 0 ? Math.round(((currentIndex + 1) / cards.length) * 100) : 0;

  return (
    <div className="relative w-full max-w-6xl mx-auto py-space-md pb-16">
      {/* Ambient Glows */}
      <div className="absolute -top-12 left-1/4 w-96 h-96 bg-primary-fixed/30 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-48 right-12 w-80 h-80 bg-secondary-fixed/25 dark:bg-purple-900/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Screen Title Area */}
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex items-center gap-space-xs mb-1">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-fixed dark:bg-indigo-500/20 text-primary dark:text-indigo-300 font-label-sm text-label-sm font-semibold border border-border-glass">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span> Active Session
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
            SRS Spaced Repetition
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface dark:text-text-crisp-white tracking-tight font-bold">
          Flashcards
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Generate and study smart recall cards. Select a document and enter an optional topic to focus your deck.
        </p>
      </div>

      {/* Unified Source Document & Settings Selector */}
      <SourceDocSelector
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDocId={onSelectDocId}
        selectedDocIds={selectedDocIds}
        onSelectDocIds={onSelectDocIds}
        topic={topic}
        onTopicChange={setTopic}
        topicPlaceholder="Focus topic (optional, e.g. Core Algorithms, Definitions)..."
        onGenerate={() => handleGenerate(Boolean(artifact))}
        generateLabel={artifact ? "Regenerate Deck" : "Generate Flashcards"}
        loading={loading}
        disabled={!isReady}
        extraControls={
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 min-w-[120px]">
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

            <div className="flex flex-col gap-1 min-w-[110px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Cards
              </label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={loading}
                className="pl-3 pr-6 py-2 rounded-xl bg-surface-base dark:bg-slate-900 text-on-surface dark:text-slate-100 font-label-md text-label-md border border-border-glass cursor-pointer"
              >
                <option value={4} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">4 Cards</option>
                <option value={6} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">6 Cards</option>
                <option value={10} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">10 Cards</option>
                <option value={20} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">20 Cards</option>
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

      {/* Main Flashcard Workspace Stage */}
      {!artifact && !loading ? (
        <div className="w-full p-16 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-secondary-fixed dark:bg-purple-500/20 text-secondary dark:text-purple-300 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">style</span>
          </div>
          <div className="max-w-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold">
              {documents.length === 0 ? "No Documents In Collection" : "No Flashcards Created Yet"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {documents.length === 0
                ? "Upload documents first to synthesize smart flashcards."
                : "Select your source document above, enter an optional focus topic, and click Generate Flashcards."}
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
              Generate Flashcard Deck →
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="w-full p-20 rounded-3xl bg-surface-container-lowest/80 dark:bg-surface-elevated/80 border border-border-glass backdrop-blur-xl text-center flex flex-col items-center justify-center gap-4 animate-pulse">
          <span className="material-symbols-outlined text-[48px] text-indigo-400 animate-spin">refresh</span>
          <span className="font-title-md text-title-md text-on-surface dark:text-text-crisp-white font-semibold">
            Synthesizing smart flashcards with grounded citations...
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Extracting core recall questions from selected document
          </span>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center">
          {/* Progress Section & Metric Strip */}
          <div className="w-full max-w-3xl flex flex-col items-center mb-space-md px-space-xs">
            <div className="w-full flex items-center justify-between text-on-surface-variant mb-2">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white font-bold tracking-tight">
                  Card <span className="text-primary">{currentIndex + 1}</span>
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  of {cards.length}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-label-sm text-label-sm bg-surface-container-low dark:bg-surface-container px-2.5 py-1 rounded-md text-on-surface dark:text-slate-200 border border-border-glass">
                  Unit: {topic || "Core Principles"}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-surface-container-high dark:bg-surface-container overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-primary via-primary-container to-secondary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Interactive 3D Flip Card Container */}
          {currentCard && (
            <div className="w-full max-w-3xl h-[420px] mb-space-lg perspective-[1200px]">
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className={`relative w-full h-full rounded-3xl transition-transform duration-500 transform-style-3d cursor-pointer ${
                  isFlipped ? "rotate-y-180" : ""
                }`}
              >
                {/* FRONT FACE */}
                <div className="absolute inset-0 w-full h-full backface-hidden p-8 sm:p-10 rounded-3xl bg-surface-container-lowest/90 dark:bg-surface-elevated/90 border border-border-glass backdrop-blur-2xl shadow-xl flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-400/30">
                      {currentCard.difficulty}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBookmarkedIds((b) => ({ ...b, [currentCard.id]: !b[currentCard.id] }));
                      }}
                      className="text-on-surface-variant hover:text-amber-400 p-1"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {bookmarkedIds[currentCard.id] ? "bookmark" : "bookmark_border"}
                      </span>
                    </button>
                  </div>

                  <div className="my-auto text-center px-4">
                    <h3 className="font-headline-md text-headline-md text-on-surface dark:text-text-crisp-white font-bold leading-relaxed">
                      {currentCard.question}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between text-xs text-on-surface-variant pt-4 border-t border-border-glass">
                    <span>Press Space or click to reveal answer</span>
                    <span className="material-symbols-outlined text-[18px]">touch_app</span>
                  </div>
                </div>

                {/* BACK FACE */}
                <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 p-8 sm:p-10 rounded-3xl bg-surface-container-lowest/95 dark:bg-surface-elevated/95 border border-indigo-500/40 backdrop-blur-2xl shadow-2xl flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-400/30">
                      Answer
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAudioReadout();
                      }}
                      className="text-on-surface-variant hover:text-indigo-400 p-1"
                      title="Audio Readout"
                    >
                      <span className="material-symbols-outlined text-[20px]">volume_up</span>
                    </button>
                  </div>

                  <div className="my-auto flex flex-col gap-3 px-2 overflow-y-auto max-h-[220px]">
                    <div className="font-title-md text-title-md text-text-crisp-white font-semibold">
                      {currentCard.answer}
                    </div>
                    {currentCard.explanation && (
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                        {currentCard.explanation}
                      </p>
                    )}
                  </div>

                  {/* SRS Rating Bar */}
                  <div className="flex items-center justify-between pt-4 border-t border-border-glass gap-2">
                    <span className="text-xs text-on-surface-variant shrink-0">Recall score:</span>
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      {["Again", "Hard", "Good", "Easy"].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRate(rate);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            ratings[currentCard.id] === rate
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-surface-base dark:bg-slate-800 text-on-surface-variant hover:text-on-surface dark:hover:text-white border border-border-glass"
                          }`}
                        >
                          {rate}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controls Bar: Shuffle, Prev, Next */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              className="p-3 rounded-2xl bg-surface-elevated border border-border-glass text-on-surface hover:text-text-crisp-white shadow-sm transition-all"
              title="Previous Card"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
            <button
              type="button"
              onClick={handleShuffle}
              className="px-4 py-2.5 rounded-2xl bg-surface-elevated border border-border-glass text-on-surface hover:text-text-crisp-white shadow-sm text-sm font-semibold flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">shuffle</span>
              <span>Shuffle</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-2xl bg-surface-elevated border border-border-glass text-on-surface hover:text-text-crisp-white shadow-sm text-sm font-semibold flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-3 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 shadow-md transition-all"
              title="Next Card"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
