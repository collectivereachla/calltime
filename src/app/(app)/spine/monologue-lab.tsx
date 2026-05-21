"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { addAnnotation } from "./spine-actions";

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

interface Props {
  lines: ScriptLine[];
  annotations: Annotation[];
  scriptTitle: string;
  personId: string;
  character: string;
}

type Mode = "beats" | "run" | "map";

function firstLetterTransform(text: string): string {
  return text.replace(/[A-Za-z\u2019']+/g, (word) => word[0]);
}

/* ─── BEAT WORK ─────────────────────────────────────────────── */

function BeatCard({
  line,
  beatNum,
  annotations,
  personId,
  character,
}: {
  line: ScriptLine;
  beatNum: number;
  annotations: Annotation[];
  personId: string;
  character: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [verb, setVerb] = useState("");
  const [saving, setSaving] = useState(false);

  const coaching = annotations.filter(
    (a) => a.script_line_id === line.id && a.note_type === "acting"
  );
  const pinned = coaching.filter((a) => a.is_pinned);
  const other = coaching.filter((a) => !a.is_pinned);

  async function saveVerb() {
    if (!verb.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("script_line_id", line.id);
    fd.set("content", `ACTIVE VERB: ${verb.trim()}`);
    fd.set("note_type", "acting");
    fd.set("visibility", "production");
    fd.set("tagged_characters", character);
    fd.set("is_pinned", "false");
    await addAnnotation(fd);
    setVerb("");
    setSaving(false);
  }

  return (
    <div className="bg-card border border-bone rounded-card overflow-hidden">
      {/* Beat header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-paper/50 transition-colors"
      >
        <span className="font-mono text-data-sm text-brick font-semibold mt-0.5 shrink-0">
          {beatNum}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-body-md text-ink leading-relaxed">
            {line.content.length > 140 && !expanded
              ? line.content.slice(0, 140) + "…"
              : line.content}
          </p>
          {pinned.length > 0 && !expanded && (
            <p className="text-body-xs text-brick mt-1.5 truncate">
              📌 {pinned[0].content.slice(0, 80)}
              {pinned[0].content.length > 80 ? "…" : ""}
            </p>
          )}
        </div>
        <span className="text-ash text-body-sm shrink-0 mt-0.5">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Expanded: coaching notes + verb input */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-bone/50 space-y-4">
          {/* Full text */}
          <p className="font-serif text-body-lg text-ink leading-relaxed pt-4">
            {line.content}
          </p>

          {/* Coaching annotations */}
          {coaching.length > 0 && (
            <div className="space-y-2">
              {coaching.map((a) => (
                <div
                  key={a.id}
                  className={`text-body-sm leading-relaxed rounded-md px-3 py-2.5 ${
                    a.is_pinned
                      ? "bg-brick/5 border-l-3 border-brick text-ink"
                      : "bg-paper text-ash"
                  }`}
                >
                  {a.content}
                </div>
              ))}
            </div>
          )}

          {/* Active verb input */}
          <div className="pt-2">
            <p className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">
              What is Booth doing here? (active verb)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={verb}
                onChange={(e) => setVerb(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveVerb();
                }}
                placeholder="e.g. seducing, pleading, accusing, performing…"
                className="flex-1 px-3 py-2 bg-paper border border-bone rounded text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
              <button
                onClick={saveVerb}
                disabled={saving || !verb.trim()}
                className="px-4 py-2 bg-ink text-paper rounded text-body-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-40"
              >
                {saving ? "…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── RUN MODE ──────────────────────────────────────────────── */

function RunMode({ lines }: { lines: ScriptLine[] }) {
  const [revealedIdx, setRevealedIdx] = useState(-1);
  const [showFirstLetter, setShowFirstLetter] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allRevealed = revealedIdx >= lines.length - 1;

  useEffect(() => {
    if (timerActive) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerActive]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function revealNext() {
    if (revealedIdx < lines.length - 1) {
      setRevealedIdx((prev) => prev + 1);
      if (!timerActive && revealedIdx === -1) {
        setTimerActive(true);
      }
    } else {
      setTimerActive(false);
    }
  }

  function reset() {
    setRevealedIdx(-1);
    setTimerActive(false);
    setElapsed(0);
  }

  // Color the timer based on competition window
  const timerColor =
    elapsed <= 180
      ? "text-muted" // under 3 min — too short
      : elapsed <= 300
        ? "text-confirmed" // 3-5 min — target zone
        : "text-conflict"; // over 5 min — deduction territory

  return (
    <div>
      {/* Timer + controls */}
      <div className="flex items-center justify-between mb-5 print:hidden">
        <div className="flex items-center gap-3">
          <span className={`font-mono text-display-sm font-medium tabular-nums ${timerColor}`}>
            {formatTime(elapsed)}
          </span>
          {elapsed > 300 && (
            <span className="font-mono text-data-sm text-conflict">
              −{Math.min(5, Math.ceil((elapsed - 300) / 60))} pts
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFirstLetter(!showFirstLetter)}
            className={`px-3 py-1.5 rounded text-body-xs font-medium border transition-colors ${
              showFirstLetter
                ? "border-brick bg-brick/5 text-brick"
                : "border-bone bg-card text-ash hover:text-ink"
            }`}
          >
            {showFirstLetter ? "Abc" : "A__"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded text-body-xs font-medium border border-bone bg-card text-ash hover:text-ink transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Target zone indicator */}
      <div className="h-1.5 w-full bg-bone/50 rounded-full mb-6 print:hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-1000"
          style={{
            width: `${Math.min(100, (elapsed / 300) * 100)}%`,
            backgroundColor:
              elapsed <= 180
                ? "#A39E96"
                : elapsed <= 300
                  ? "#1A6D4A"
                  : "#C4522D",
          }}
        />
      </div>

      {/* The monologue */}
      <div
        className="cursor-pointer select-none min-h-[200px]"
        onClick={revealNext}
      >
        {revealedIdx === -1 && (
          <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
            <p className="text-body-md text-ash">Tap to start your run.</p>
            <p className="text-body-xs text-muted mt-1">
              Each tap reveals the next beat. Timer starts on first tap.
            </p>
          </div>
        )}

        {lines.map((line, idx) => {
          if (idx > revealedIdx) return null;
          const isLatest = idx === revealedIdx;
          return (
            <div
              key={line.id}
              className={`mb-4 transition-opacity duration-300 ${
                isLatest ? "opacity-100" : "opacity-60"
              }`}
            >
              <span className="font-mono text-data-sm text-brick mr-2">
                {idx + 1}
              </span>
              <span
                className={`leading-relaxed ${
                  showFirstLetter
                    ? "font-mono text-body-md tracking-wide text-ink"
                    : "font-serif text-body-lg text-ink"
                }`}
              >
                {showFirstLetter
                  ? firstLetterTransform(line.content)
                  : line.content}
              </span>
            </div>
          );
        })}

        {allRevealed && (
          <div className="mt-6 pt-4 border-t border-bone text-center print:hidden">
            <p className="font-mono text-data-sm text-muted">
              Run complete · {formatTime(elapsed)}
              {elapsed >= 180 && elapsed <= 300
                ? " · in the zone"
                : elapsed > 300
                  ? ` · ${Math.min(5, Math.ceil((elapsed - 300) / 60))} pt deduction`
                  : " · under 3 min"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── IMPULSE MAP ───────────────────────────────────────────── */

function ImpulseMap({
  lines,
  annotations,
}: {
  lines: ScriptLine[];
  annotations: Annotation[];
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-data-sm text-muted uppercase tracking-wider mb-4">
        Beat triggers · skim before you go on
      </p>
      {lines.map((line, idx) => {
        const beatAnnotations = annotations.filter(
          (a) => a.script_line_id === line.id && a.note_type === "acting"
        );
        const verbNote = beatAnnotations.find((a) =>
          a.content.startsWith("ACTIVE VERB:")
        );
        const pinnedNote = beatAnnotations.find((a) => a.is_pinned);

        // First 5-6 words as the trigger
        const words = line.content.split(/\s+/);
        const trigger = words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");

        return (
          <div
            key={line.id}
            className="flex items-baseline gap-3 py-2 border-b border-bone/50 last:border-0"
          >
            <span className="font-mono text-data-sm text-brick font-semibold w-5 shrink-0 text-right">
              {idx + 1}
            </span>
            <span className="text-body-sm text-ink flex-1">{trigger}</span>
            {verbNote && (
              <span className="font-mono text-data-sm text-confirmed shrink-0">
                {verbNote.content.replace("ACTIVE VERB: ", "")}
              </span>
            )}
            {!verbNote && pinnedNote && (
              <span className="text-body-xs text-ash truncate max-w-[200px] shrink-0">
                {pinnedNote.content.slice(0, 40)}…
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── MAIN COMPONENT ────────────────────────────────────────── */

export function MonologueLab({ lines, annotations, scriptTitle, personId, character }: Props) {
  const [mode, setMode] = useState<Mode>("beats");

  const dialogueLines = useMemo(
    () => lines.filter((l) => l.line_type === "dialogue"),
    [lines]
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Mode selector */}
      <div className="flex items-center gap-1 mb-6 print:hidden">
        {([
          ["beats", "Beat work"],
          ["run", "Run"],
          ["map", "Map"],
        ] as [Mode, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-4 py-2 rounded-lg text-body-sm font-medium transition-colors ${
              mode === key
                ? "bg-ink text-paper"
                : "bg-card text-ash hover:text-ink border border-bone"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* BEAT WORK */}
      {mode === "beats" && (
        <div className="space-y-3">
          <p className="text-body-sm text-ash mb-4">
            For each beat: what is {character.charAt(0) + character.slice(1).toLowerCase()} <em>doing</em>? Name the tactic. The verb should be something you could do to another person.
          </p>
          {dialogueLines.map((line, idx) => (
            <BeatCard
              key={line.id}
              line={line}
              beatNum={idx + 1}
              annotations={annotations}
              personId={personId}
              character={character}
            />
          ))}
        </div>
      )}

      {/* RUN */}
      {mode === "run" && <RunMode lines={dialogueLines} />}

      {/* MAP */}
      {mode === "map" && (
        <ImpulseMap lines={dialogueLines} annotations={annotations} />
      )}
    </div>
  );
}
