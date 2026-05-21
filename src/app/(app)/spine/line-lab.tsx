"use client";

import { useState, useMemo, useCallback } from "react";
import { MonologueLab } from "./monologue-lab";

interface ScriptLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
}

interface Annotation {
  id: string;
  script_line_id: string;
  person_id: string;
  annotation_type: string;
  content: string;
  tagged_characters: string[];
  visibility: string;
  note_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface VerseAnalysis {
  lines: {
    original: string;
    scansion: string;
    feet: string;
    meter: string;
    syllable_count: number;
    is_regular: boolean;
    note: string;
  }[];
  paraphrase: string;
  verse_or_prose: string;
  context_note: string;
  acting_note: string;
}

interface Props {
  lines: ScriptLine[];
  annotations: Annotation[];
  myCharacters: string[];
  allCharacters: string[];
  scriptTitle: string;
  personId: string;
  isMonologue: boolean;
  soloCharacter: string | null;
}

type Mode = "monologue" | "notecards" | "first-letter" | "verse-coach";

function firstLetterTransform(text: string): string {
  // Replace each word with its first letter, preserving punctuation attached to words
  return text.replace(/[A-Za-z\u2019']+/g, (word) => {
    // Keep the first letter, drop the rest of the alphabetic chars
    return word[0];
  });
}

export function LineLab({ lines, annotations, myCharacters, allCharacters, scriptTitle, personId, isMonologue, soloCharacter }: Props) {
  const [mode, setMode] = useState<Mode>(isMonologue ? "monologue" : "notecards");
  const [selectedCharacter, setSelectedCharacter] = useState<string>(
    soloCharacter || (myCharacters.length > 0 ? myCharacters[0] : allCharacters[0] || "")
  );
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showFirstLetter, setShowFirstLetter] = useState(true);

  // Verse coach state
  const [verseAnalysis, setVerseAnalysis] = useState<VerseAnalysis | null>(null);
  const [verseLoading, setVerseLoading] = useState(false);
  const [verseError, setVerseError] = useState<string | null>(null);
  const [analyzedLineId, setAnalyzedLineId] = useState<string | null>(null);
  const [verseInput, setVerseInput] = useState("");

  const analyzeVerse = useCallback(async (text: string, lineId?: string) => {
    if (!text.trim()) return;
    setVerseLoading(true);
    setVerseError(null);
    setVerseAnalysis(null);
    setAnalyzedLineId(lineId || null);

    try {
      const res = await fetch("/api/verse-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerseError(data.error || `Error ${res.status}`);
        return;
      }
      setVerseAnalysis(data);
    } catch (err: unknown) {
      setVerseError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setVerseLoading(false);
    }
  }, []);

  // Filter out non-dialogue lines and character_name rows
  const dialogueLines = useMemo(() =>
    lines.filter((l) => l.line_type === "dialogue" && l.character),
    [lines]
  );

  // Resolve selected character to matching script character names
  const matchesCharacter = (lineChar: string, selected: string): boolean => {
    const upper = selected.toUpperCase();
    const parts = upper.split(" / ");
    return parts.some((p) => lineChar.toUpperCase().includes(p) || p.includes(lineChar.toUpperCase()));
  };

  // Build notecards: each card = { cueLine, myLine, act, scene }
  const notecards = useMemo(() => {
    const cards: { cueLine: string; cueCharacter: string; myLine: string; myCharacter: string; act: number; scene: number; lineNumber: number }[] = [];
    for (let i = 0; i < dialogueLines.length; i++) {
      const line = dialogueLines[i];
      if (line.character && matchesCharacter(line.character, selectedCharacter)) {
        // Find the previous dialogue line (the cue)
        let cue = { content: "(Top of scene)", character: "STAGE DIRECTION" };
        for (let j = i - 1; j >= 0; j--) {
          if (dialogueLines[j].character && !matchesCharacter(dialogueLines[j].character!, selectedCharacter)) {
            cue = { content: dialogueLines[j].content, character: dialogueLines[j].character! };
            break;
          }
        }
        cards.push({
          cueLine: cue.content,
          cueCharacter: cue.character,
          myLine: line.content,
          myCharacter: line.character,
          act: line.act,
          scene: line.scene,
          lineNumber: line.line_number,
        });
      }
    }
    return cards;
  }, [dialogueLines, selectedCharacter]);

  // Build first-letter lines: all my lines grouped by scene
  const firstLetterScenes = useMemo(() => {
    const scenes = new Map<string, { act: number; scene: number; lines: { original: string; transformed: string; character: string; lineNumber: number }[] }>();
    for (const line of dialogueLines) {
      if (line.character && matchesCharacter(line.character, selectedCharacter)) {
        const key = `${line.act}-${line.scene}`;
        if (!scenes.has(key)) {
          scenes.set(key, { act: line.act, scene: line.scene, lines: [] });
        }
        scenes.get(key)!.lines.push({
          original: line.content,
          transformed: firstLetterTransform(line.content),
          character: line.character,
          lineNumber: line.line_number,
        });
      }
    }
    return Array.from(scenes.values()).sort((a, b) => a.act * 100 + a.scene - (b.act * 100 + b.scene));
  }, [dialogueLines, selectedCharacter]);

  const currentCard = notecards[currentCardIdx] || null;
  const totalCards = notecards.length;

  function nextCard() {
    setRevealed(false);
    setCurrentCardIdx((prev) => Math.min(prev + 1, totalCards - 1));
  }

  function prevCard() {
    setRevealed(false);
    setCurrentCardIdx((prev) => Math.max(prev - 1, 0));
  }

  // Everyone can see all characters — default to your own if you have one
  const characterOptions = allCharacters;

  // Pure monologue script: render MonologueLab directly (it has its own mode selector)
  if (isMonologue && soloCharacter) {
    return (
      <MonologueLab
        lines={lines}
        annotations={annotations}
        scriptTitle={scriptTitle}
        personId={personId}
        character={soloCharacter}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Character + mode selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <select
          value={selectedCharacter}
          onChange={(e) => { setSelectedCharacter(e.target.value); setCurrentCardIdx(0); setRevealed(false); }}
          className="px-3 py-2 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
        >
          {characterOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-bone overflow-hidden">
          <button
            onClick={() => setMode("monologue")}
            className={`px-4 py-2 text-body-sm font-medium transition-colors ${
              mode === "monologue" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"
            }`}
          >
            Monologue
          </button>
          <button
            onClick={() => setMode("notecards")}
            className={`px-4 py-2 text-body-sm font-medium transition-colors ${
              mode === "notecards" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"
            }`}
          >
            Notecards
          </button>
          <button
            onClick={() => setMode("first-letter")}
            className={`px-4 py-2 text-body-sm font-medium transition-colors ${
              mode === "first-letter" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"
            }`}
          >
            First Letters
          </button>
          <button
            onClick={() => setMode("verse-coach")}
            className={`px-4 py-2 text-body-sm font-medium transition-colors ${
              mode === "verse-coach" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"
            }`}
          >
            Verse Coach
          </button>
        </div>

        <span className="font-mono text-data-sm text-muted ml-auto">
          {notecards.length} lines
        </span>
      </div>

      {/* MONOLOGUE MODE */}
      {mode === "monologue" && (
        <MonologueLab
          lines={lines.filter(
            (l) => l.line_type === "dialogue" && l.character && matchesCharacter(l.character, selectedCharacter)
          )}
          annotations={annotations}
          scriptTitle={scriptTitle}
          personId={personId}
          character={selectedCharacter}
        />
      )}

      {/* NOTECARD MODE */}
      {mode === "notecards" && (
        <div>
          {currentCard ? (
            <div className="space-y-4">
              {/* Location badge */}
              <div className="font-mono text-data-sm text-muted">
                Act {currentCard.act === 1 ? "I" : "II"} · Scene {currentCard.scene} · Card {currentCardIdx + 1} of {totalCards}
              </div>

              {/* Cue line */}
              <div className="bg-card border border-bone rounded-card p-5">
                <p className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">
                  {currentCard.cueCharacter}
                </p>
                <p className="text-body-md text-ink leading-relaxed">
                  {currentCard.cueLine}
                </p>
              </div>

              {/* The card — click to flip */}
              <div
                onClick={() => setRevealed(!revealed)}
                className={`rounded-card p-5 cursor-pointer transition-all duration-200 min-h-[120px] flex flex-col justify-center ${
                  revealed
                    ? "bg-brick/5 border-2 border-brick/30"
                    : "bg-bone/30 border-2 border-bone hover:border-ash"
                }`}
              >
                {revealed ? (
                  <>
                    <p className="font-mono text-data-sm text-brick uppercase tracking-wider mb-2">
                      {currentCard.myCharacter}
                    </p>
                    <p className="text-body-md text-ink leading-relaxed">
                      {currentCard.myLine}
                    </p>
                  </>
                ) : (
                  <p className="text-body-md text-ash text-center italic">
                    Tap to reveal your line
                  </p>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={prevCard}
                  disabled={currentCardIdx === 0}
                  className="text-body-sm text-ash hover:text-ink disabled:opacity-30 transition-colors"
                >
                  ← Previous
                </button>
                <button
                  onClick={nextCard}
                  disabled={currentCardIdx === totalCards - 1}
                  className="text-body-sm text-ash hover:text-ink disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
              <p className="text-body-md text-ash">No lines found for this character.</p>
            </div>
          )}
        </div>
      )}

      {/* FIRST LETTER MODE */}
      {mode === "first-letter" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-2 text-body-sm text-ash cursor-pointer">
              <input
                type="checkbox"
                checked={showFirstLetter}
                onChange={(e) => setShowFirstLetter(e.target.checked)}
                className="rounded border-bone"
              />
              Show first-letter version
            </label>
            <p className="text-body-xs text-muted">
              Write each line using only the first letter of every word. Match the punctuation exactly.
            </p>
          </div>

          {firstLetterScenes.map((scene) => (
            <div key={`${scene.act}-${scene.scene}`}>
              <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-3">
                Act {scene.act === 1 ? "I" : "II"} · Scene {scene.scene}
              </h3>
              <div className="space-y-3">
                {scene.lines.map((line, idx) => (
                  <div key={idx} className="bg-card border border-bone rounded-card p-4">
                    <p className="font-mono text-data-sm text-brick uppercase tracking-wider mb-1">
                      {line.character}
                    </p>
                    {showFirstLetter ? (
                      <p className="text-body-md text-ink leading-relaxed font-mono tracking-wide">
                        {line.transformed}
                      </p>
                    ) : (
                      <p className="text-body-md text-ink leading-relaxed">
                        {line.original}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {firstLetterScenes.length === 0 && (
            <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
              <p className="text-body-md text-ash">No lines found for this character.</p>
            </div>
          )}
        </div>
      )}

      {/* VERSE COACH MODE */}
      {mode === "verse-coach" && (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Free input */}
          <div>
            <p className="text-body-sm text-ash mb-3">
              Paste any line, or tap one of your lines below to scan its meter.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={verseInput}
                onChange={(e) => setVerseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && verseInput.trim()) {
                    analyzeVerse(verseInput);
                  }
                }}
                placeholder="Paste a line of verse..."
                className="flex-1 px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors font-serif"
              />
              <button
                onClick={() => analyzeVerse(verseInput)}
                disabled={verseLoading || !verseInput.trim()}
                className="px-4 py-2.5 bg-ink text-paper rounded-card text-body-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-40"
              >
                {verseLoading ? "..." : "Scan"}
              </button>
            </div>
          </div>

          {/* Error */}
          {verseError && (
            <div className="px-4 py-3 bg-brick/5 border border-brick/20 rounded-card">
              <p className="text-body-sm text-brick">{verseError}</p>
            </div>
          )}

          {/* Analysis results */}
          {verseAnalysis && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Verse/Prose badge */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded text-data-sm font-semibold uppercase tracking-wider ${
                  verseAnalysis.verse_or_prose === "verse"
                    ? "bg-confirmed/10 text-confirmed"
                    : "bg-tentative/10 text-tentative"
                }`}>
                  {verseAnalysis.verse_or_prose}
                </span>
                {verseAnalysis.context_note && (
                  <span className="text-body-xs text-ash italic">{verseAnalysis.context_note}</span>
                )}
              </div>

              {/* Scansion card */}
              <div className="bg-card border border-bone rounded-card p-5 space-y-5">
                <p className="font-mono text-data-sm text-muted uppercase tracking-wider">Scansion</p>
                {verseAnalysis.lines?.map((line, i) => (
                  <div key={i} className={i < verseAnalysis.lines.length - 1 ? "pb-5 border-b border-bone/50" : ""}>
                    <p className="font-serif text-body-lg text-ink leading-relaxed">{line.original}</p>

                    {/* Stress marks */}
                    <div className="flex flex-wrap gap-0.5 mt-1.5 font-mono">
                      {line.scansion.split(/\s+/).map((s, j) => (
                        <span key={j} className={`text-base ${s === "/" ? "text-brick font-bold" : "text-muted"}`}>
                          {s === "/" ? "′" : "˘"}
                        </span>
                      ))}
                    </div>

                    {/* Feet */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {line.feet.split(",").map((foot, j) => {
                        const f = foot.trim().toLowerCase();
                        const color = f === "trochee" ? "bg-brick text-paper"
                          : f === "spondee" ? "bg-confirmed text-paper"
                          : f === "pyrrhic" ? "bg-muted text-paper"
                          : "bg-bone text-ink";
                        return (
                          <span key={j} className={`px-2 py-0.5 rounded text-data-sm font-medium uppercase tracking-wide ${color}`}>
                            {foot.trim()}
                          </span>
                        );
                      })}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-mono text-data-sm text-muted">
                        {line.syllable_count} syl · {line.meter}
                      </span>
                      {!line.is_regular && (
                        <span className="text-data-sm text-brick font-semibold">⚡ irregular</span>
                      )}
                    </div>

                    {/* Note on irregularity */}
                    {line.note && (
                      <p className="text-body-sm text-ash italic mt-2 pl-3 border-l-2 border-brick/30">
                        {line.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Paraphrase */}
              {verseAnalysis.paraphrase && (
                <div className="bg-card border border-bone rounded-card p-5">
                  <p className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">In plain English</p>
                  <p className="font-serif text-body-md text-ink leading-relaxed">{verseAnalysis.paraphrase}</p>
                </div>
              )}

              {/* Acting note */}
              {verseAnalysis.acting_note && (
                <div className="bg-brick/5 border border-brick/15 rounded-card p-5">
                  <p className="font-mono text-data-sm text-brick uppercase tracking-wider mb-2">Acting note</p>
                  <p className="text-body-sm text-ink leading-relaxed">{verseAnalysis.acting_note}</p>
                </div>
              )}
            </div>
          )}

          {/* Tappable character lines */}
          <div>
            <p className="font-mono text-data-sm text-muted uppercase tracking-wider mb-3">
              {selectedCharacter}&apos;s lines — tap to scan
            </p>
            <div className="space-y-2">
              {dialogueLines
                .filter((l) => l.character && matchesCharacter(l.character, selectedCharacter))
                .map((line) => (
                  <button
                    key={line.id}
                    onClick={() => {
                      setVerseInput(line.content);
                      analyzeVerse(line.content, line.id);
                    }}
                    disabled={verseLoading}
                    className={`w-full text-left px-4 py-3 rounded-card border transition-colors ${
                      analyzedLineId === line.id
                        ? "border-brick/40 bg-brick/5"
                        : "border-bone bg-card hover:border-ash"
                    } disabled:opacity-50`}
                  >
                    <span className="font-mono text-data-sm text-muted mr-2">
                      {line.act}.{line.scene}
                    </span>
                    <span className="text-body-sm text-ink">
                      {line.content.length > 120 ? line.content.slice(0, 120) + "..." : line.content}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
