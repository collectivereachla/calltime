"use client";

import { useState, useMemo } from "react";

interface ScriptLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
}

interface Props {
  lines: ScriptLine[];
  myCharacters: string[];
  allCharacters: string[];
  scriptTitle: string;
}

type Mode = "notecards" | "first-letter";

function firstLetterTransform(text: string): string {
  // Replace each word with its first letter, preserving punctuation attached to words
  return text.replace(/[A-Za-z\u2019']+/g, (word) => {
    // Keep the first letter, drop the rest of the alphabetic chars
    return word[0];
  });
}

export function LineLab({ lines, myCharacters, allCharacters, scriptTitle }: Props) {
  const [mode, setMode] = useState<Mode>("notecards");
  const [selectedCharacter, setSelectedCharacter] = useState<string>(
    myCharacters.length > 0 ? myCharacters[0] : allCharacters[0] || ""
  );
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showFirstLetter, setShowFirstLetter] = useState(true);

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
        </div>

        <span className="font-mono text-data-sm text-muted ml-auto">
          {notecards.length} lines
        </span>
      </div>

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
    </div>
  );
}
