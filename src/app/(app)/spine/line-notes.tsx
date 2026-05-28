"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { addFastLineNote, markLineNoteCorrected, markLineNoteGiven } from "../run/actions";

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
  note_type: string;
  content: string;
}

export interface LineNote {
  id: string;
  person_id: string;
  actor_name: string;
  author_name: string | null;
  script_line_id: string | null;
  scene_ref: string | null;
  line_ref: string | null;
  category: string;
  note_type: string;
  content: string;
  marked_text: string | null;
  given_to_actor: boolean;
  corrected_at: string | null;
  created_at: string;
}

interface Props {
  lines: ScriptLine[];
  canManage: boolean;
  personId: string;
  productionId: string;
  notes: LineNote[];
  cast: { person_id: string; name: string; role_title: string }[];
  annotations: Annotation[];
}

type NoteCategory = "line" | "blocking";

// Naturalistic-tuned note types. note_type is free text in the DB; these are the
// fast-capture palette. Order = frequency in an off-book run.
const LINE_TYPES: { value: string; label: string; short: string; span?: boolean }[] = [
  { value: "called_line", label: "Called line", short: "Line" },
  { value: "dropped", label: "Dropped", short: "Dropped", span: true },
  { value: "paraphrased", label: "Paraphrased", short: "Para" },
  { value: "jumped", label: "Jumped", short: "Jumped" },
  { value: "cue", label: "Cue", short: "Cue" },
];

// Blocking-issue types: what an actor commonly gets wrong in execution.
const BLOCKING_TYPES: { value: string; label: string; short: string }[] = [
  { value: "position", label: "Wrong position", short: "Position" },
  { value: "cross", label: "Missed / wrong cross", short: "Cross" },
  { value: "entrance", label: "Entrance", short: "Entrance" },
  { value: "exit", label: "Exit", short: "Exit" },
];

const ALL_TYPES = [...LINE_TYPES, ...BLOCKING_TYPES];

function typeLabel(value: string): string {
  return ALL_TYPES.find((t) => t.value === value)?.label || value.replace(/_/g, " ");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LineNotes({ lines, canManage, personId, productionId, notes, cast, annotations }: Props) {
  const router = useRouter();
  const [previewActorId, setPreviewActorId] = useState<string | null>(null);

  // Blocking-report state: which planned-blocking note is open for reporting,
  // and which actors are selected for it.
  const [openBlockingId, setOpenBlockingId] = useState<string | null>(null);
  const [blkActors, setBlkActors] = useState<Set<string>>(new Set());
  const [blkFlash, setBlkFlash] = useState<{ id: string; text: string } | null>(null);

  // Best-effort: which cast members are named in a blocking note's text, so the
  // common actors are pre-selected when the SM taps to report.
  const detectActors = useCallback(
    (content: string): string[] => {
      const up = ` ${content.toUpperCase()} `;
      return cast
        .filter((c) =>
          c.role_title
            .toUpperCase()
            .split(" / ")
            .some((part) => {
              const p = part.trim();
              return p.length >= 3 && up.includes(` ${p} `);
            })
        )
        .map((c) => c.person_id);
    },
    [cast]
  );

  function openBlockingReport(a: Annotation) {
    if (openBlockingId === a.id) { setOpenBlockingId(null); return; }
    setOpenBlockingId(a.id);
    setBlkActors(new Set(detectActors(a.content)));
  }

  // Planned blocking, keyed by line — shown inline so the SM follows the full prompt book.
  const blockingByLine = useMemo(() => {
    const m = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (a.note_type !== "blocking") continue;
      const arr = m.get(a.script_line_id) || [];
      arr.push(a);
      m.set(a.script_line_id, arr);
    }
    return m;
  }, [annotations]);

  // Markable lines = dialogue with a character (those resolve to an actor).
  const renderable = useMemo(
    () => lines.filter((l) => l.line_type !== "character_name"),
    [lines]
  );

  // Scene grouping for navigation.
  const sceneKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const l of renderable) keys.add(`${l.act}-${l.scene}`);
    return Array.from(keys).sort((a, b) => {
      const [aa, as] = a.split("-").map(Number);
      const [ba, bs] = b.split("-").map(Number);
      return aa - ba || as - bs;
    });
  }, [renderable]);

  const [sceneKey, setSceneKey] = useState<string>(sceneKeys[0] || "");
  const sceneIdx = sceneKeys.indexOf(sceneKey);
  const sceneLines = useMemo(
    () => renderable.filter((l) => `${l.act}-${l.scene}` === sceneKey),
    [renderable, sceneKey]
  );
  const markableInScene = useMemo(
    () => sceneLines.filter((l) => l.line_type === "dialogue" && l.character),
    [sceneLines]
  );

  // ── Capture state ─────────────────────────────────────────────
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [openLineId, setOpenLineId] = useState<string | null>(null); // line whose palette is open
  const [spanFor, setSpanFor] = useState<string | null>(null); // line in word-select mode
  const [spanWords, setSpanWords] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ lineId: string; text: string } | null>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Default the tracker to the first markable line of the scene.
  useEffect(() => {
    setTrackedId(markableInScene[0]?.id ?? null);
    setOpenLineId(null);
    setSpanFor(null);
  }, [sceneKey, markableInScene]);

  const noteCountByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (n.script_line_id) m.set(n.script_line_id, (m.get(n.script_line_id) || 0) + 1);
    }
    return m;
  }, [notes]);

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (markableInScene.length === 0) return;
      const idx = trackedId ? markableInScene.findIndex((l) => l.id === trackedId) : -1;
      const next = Math.max(0, Math.min(markableInScene.length - 1, (idx < 0 ? 0 : idx) + dir));
      const target = markableInScene[next];
      if (target) {
        setTrackedId(target.id);
        lineRefs.current.get(target.id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
    [markableInScene, trackedId]
  );

  // Keyboard tracker: Space / ↓ advance, ↑ back. Only for staff in capture mode.
  useEffect(() => {
    if (!canManage) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); advance(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); advance(-1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, canManage]);

  const tracked = markableInScene.find((l) => l.id === trackedId) || null;

  async function commit(line: ScriptLine, noteType: string, markedText: string | null, category: NoteCategory) {
    setSaving(true);
    const res = await addFastLineNote({
      productionId,
      scriptLineId: line.id,
      noteType,
      markedText,
      eventId: null,
      category,
    });
    setSaving(false);
    setOpenLineId(null);
    setSpanFor(null);
    setSpanWords(new Set());
    if (res?.error) {
      setFlash({ lineId: line.id, text: res.error });
      setTimeout(() => setFlash(null), 3500);
    } else {
      const verb = category === "blocking" ? "Blocking" : typeLabel(noteType);
      setFlash({ lineId: line.id, text: `${verb} → logged` });
      setTimeout(() => setFlash(null), 1400);
      router.refresh();
    }
  }

  function handleLineType(line: ScriptLine, t: (typeof LINE_TYPES)[number]) {
    if (t.span) {
      // Open word selector; specifying words is optional.
      setSpanFor(line.id);
      setSpanWords(new Set());
    } else {
      commit(line, t.value, null, "line");
    }
  }

  // Report a blocking error against a tapped planned-blocking note. The actor(s)
  // are chosen (a stage direction has no single character), and each gets a note
  // carrying the intended blocking as content.
  async function commitBlocking(a: Annotation, noteType: string) {
    const ids = [...blkActors];
    if (ids.length === 0) {
      setBlkFlash({ id: a.id, text: "Pick who it's for first." });
      setTimeout(() => setBlkFlash(null), 2500);
      return;
    }
    setSaving(true);
    const results = await Promise.all(
      ids.map((personId) =>
        addFastLineNote({
          productionId,
          scriptLineId: a.script_line_id,
          noteType,
          category: "blocking",
          personId,
          content: a.content,
          eventId: null,
        })
      )
    );
    setSaving(false);
    const err = results.find((r) => r?.error)?.error;
    if (err) {
      setBlkFlash({ id: a.id, text: err });
      setTimeout(() => setBlkFlash(null), 3500);
    } else {
      setOpenBlockingId(null);
      setBlkActors(new Set());
      setBlkFlash({ id: a.id, text: `Blocking → logged to ${ids.length} actor${ids.length > 1 ? "s" : ""}` });
      setTimeout(() => setBlkFlash(null), 1600);
      router.refresh();
    }
  }

  // A planned-blocking note, tappable to report a blocking error.
  function blockingNoteEl(a: Annotation) {
    const isOpen = openBlockingId === a.id;
    return (
      <div key={a.id} className="mt-0.5 print:mt-0">
        <button
          onClick={(e) => { e.stopPropagation(); openBlockingReport(a); }}
          className={`block text-left w-full pl-3 border-l-2 leading-relaxed transition-colors ${
            isOpen ? "border-confirmed bg-confirmed/5" : "border-confirmed/40 hover:bg-confirmed/5"
          }`}
        >
          <span className="uppercase tracking-wider text-data-sm text-confirmed/80 mr-1.5">blocking</span>
          <span className="text-body-sm text-confirmed">{a.content}</span>
        </button>

        {isOpen && (
          <div className="mt-1.5 ml-3 p-2.5 bg-card border border-bone rounded-card print:hidden" onClick={(e) => e.stopPropagation()}>
            <p className="text-body-xs text-muted mb-1.5">Who missed it? (tap to select)</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {cast.map((c) => {
                const on = blkActors.has(c.person_id);
                return (
                  <button
                    key={c.person_id}
                    onClick={() => {
                      const next = new Set(blkActors);
                      if (on) next.delete(c.person_id); else next.add(c.person_id);
                      setBlkActors(next);
                    }}
                    className={`px-2 py-1 rounded-card text-data-sm border transition-colors ${
                      on ? "bg-confirmed text-paper border-confirmed" : "bg-card text-ash border-bone hover:border-confirmed"
                    }`}
                    title={c.role_title}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-data-sm text-muted uppercase tracking-wider mr-0.5">Issue</span>
              {BLOCKING_TYPES.map((t) => (
                <button
                  key={t.value}
                  disabled={saving}
                  onClick={() => commitBlocking(a, t.value)}
                  className="px-2.5 py-1 rounded-card border border-confirmed/40 bg-card text-confirmed text-data-sm font-medium hover:bg-confirmed/10 disabled:opacity-40"
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setOpenBlockingId(null)}
                className="px-2 py-1 text-data-sm text-muted hover:text-ink ml-auto"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {blkFlash?.id === a.id && (
          <p className="text-data-sm text-confirmed mt-1 ml-3">{blkFlash.text}</p>
        )}
      </div>
    );
  }

  function paletteFor(line: ScriptLine) {
    return (
      <div className="mt-1.5 space-y-1.5 print:hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-data-sm text-muted uppercase tracking-wider w-14 shrink-0">Line</span>
          {LINE_TYPES.map((t) => (
            <button
              key={t.value}
              disabled={saving}
              onClick={() => handleLineType(line, t)}
              className="px-2.5 py-1 rounded-card border border-bone bg-card text-data-sm text-ink hover:border-brick hover:text-brick transition-colors disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-data-sm text-muted uppercase tracking-wider w-14 shrink-0">Blocking</span>
          {BLOCKING_TYPES.map((t) => (
            <button
              key={t.value}
              disabled={saving}
              onClick={() => commit(line, t.value, null, "blocking")}
              className="px-2.5 py-1 rounded-card border border-bone bg-card text-data-sm text-ink hover:border-confirmed hover:text-confirmed transition-colors disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => { setOpenLineId(null); setSpanFor(null); }}
            className="px-2 py-1 text-data-sm text-muted hover:text-ink ml-auto"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  function spanSelectorFor(line: ScriptLine) {
    const words = line.content.split(/(\s+)/); // keep whitespace tokens for reconstruction
    return (
      <div className="mt-1.5 print:hidden" onClick={(e) => e.stopPropagation()}>
        <p className="text-body-xs text-muted mb-1">Tap the dropped words, or save the whole line.</p>
        <p className="leading-relaxed">
          {words.map((w, i) => {
            if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
            const on = spanWords.has(i);
            return (
              <button
                key={i}
                onClick={() => {
                  const next = new Set(spanWords);
                  if (on) next.delete(i); else next.add(i);
                  setSpanWords(next);
                }}
                className={`text-body-sm rounded px-0.5 transition-colors ${
                  on ? "bg-brick text-paper line-through" : "text-ink hover:bg-bone"
                }`}
              >
                {w}
              </button>
            );
          })}
        </p>
        <div className="flex gap-2 mt-2">
          <button
            disabled={saving}
            onClick={() => {
              const marked = words.filter((_, i) => spanWords.has(i)).join(" ").trim();
              commit(line, "dropped", marked || null, "line");
            }}
            className="px-3 py-1 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 disabled:opacity-50"
          >
            {spanWords.size > 0 ? "Save dropped words" : "Save whole line"}
          </button>
          <button
            onClick={() => { setSpanFor(null); setSpanWords(new Set()); }}
            className="px-3 py-1 text-body-xs text-ash hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Renders the delivery view for one person. readOnly = manager preview (no "Got it").
  function actorView(targetId: string, readOnly: boolean) {
    const mine = notes
      .filter((n) => n.person_id === targetId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const open = mine.filter((n) => !n.corrected_at);
    const done = mine.filter((n) => n.corrected_at);

    if (mine.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <span className="text-3xl mb-3 opacity-40">✓</span>
          <h3 className="font-display text-display-sm text-ink mb-2">No line notes</h3>
          <p className="text-body-sm text-ash max-w-md leading-relaxed">
            {readOnly
              ? "This actor has no line notes yet. Log one from the capture view and it will appear here."
              : "When the stage manager logs a line note for you, it'll show up here with the line as written so you can see exactly what to fix."}
          </p>
        </div>
      );
    }

    const onToggle = readOnly
      ? undefined
      : async (id: string, c: boolean) => { await markLineNoteCorrected(id, c); router.refresh(); };

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <ActorNoteGroup title={`To fix (${open.length})`} notes={open} onToggle={onToggle} />
        {done.length > 0 && (
          <ActorNoteGroup title={`Got it (${done.length})`} notes={done} dimmed onToggle={onToggle} />
        )}
      </div>
    );
  }

  // ── Actor view: just their own notes ──────────────────────────
  if (!canManage) {
    return actorView(personId, false);
  }

  // ── Staff view: capture + review ──────────────────────────────
  const undelivered = notes.filter((n) => !n.given_to_actor);

  // Manager preview: see exactly what one actor's delivery view looks like.
  if (previewActorId) {
    const who = cast.find((c) => c.person_id === previewActorId)?.name || "actor";
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5 px-3 py-2 bg-bone/40 border border-bone rounded-card">
          <p className="text-body-sm text-ash">
            Previewing what <span className="font-medium text-ink">{who}</span> sees · read-only
          </p>
          <button
            onClick={() => setPreviewActorId(null)}
            className="px-3 py-1 text-body-xs text-ash hover:text-ink shrink-0"
          >
            ← Back to capture
          </button>
        </div>
        {actorView(previewActorId, true)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Scene nav */}
      <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => sceneIdx > 0 && setSceneKey(sceneKeys[sceneIdx - 1])}
            disabled={sceneIdx <= 0}
            className="px-2 py-1 text-body-sm text-ash hover:text-ink disabled:opacity-30"
          >←</button>
          <select
            value={sceneKey}
            onChange={(e) => setSceneKey(e.target.value)}
            className="px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none"
          >
            {sceneKeys.map((k) => {
              const [a, s] = k.split("-").map(Number);
              return <option key={k} value={k}>Act {a} · Scene {s}</option>;
            })}
          </select>
          <button
            onClick={() => sceneIdx < sceneKeys.length - 1 && setSceneKey(sceneKeys[sceneIdx + 1])}
            disabled={sceneIdx >= sceneKeys.length - 1}
            className="px-2 py-1 text-body-sm text-ash hover:text-ink disabled:opacity-30"
          >→</button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cast.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && setPreviewActorId(e.target.value)}
              className="px-2.5 py-1.5 bg-card border border-bone rounded-card text-body-xs text-ash focus:border-brick focus:outline-none"
              title="See what an actor's delivery view looks like"
            >
              <option value="">Preview as…</option>
              {cast.map((c) => (
                <option key={c.person_id} value={c.person_id}>{c.name}</option>
              ))}
            </select>
          )}
          {undelivered.length > 0 && (
            <DeliverButton
              count={undelivered.length}
              onDeliver={async () => {
                for (const n of undelivered) await markLineNoteGiven(n.id);
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      <p className="text-body-xs text-muted mb-3 print:hidden">
        Follow along. <kbd className="px-1 border border-bone rounded">space</kbd> or
        <kbd className="px-1 border border-bone rounded ml-1">↓</kbd> advances the marker.
        Tap any line to mark it; one tap on the bar below marks the tracked line.
      </p>

      {/* Script lines */}
      <div className="space-y-0.5 pb-32">
        {sceneLines.map((line, idx) => {
          const prev = idx > 0 ? sceneLines[idx - 1] : null;
          const showHeader =
            line.line_type === "dialogue" &&
            line.character &&
            (!prev || prev.character !== line.character || prev.line_type !== "dialogue");
          const markable = line.line_type === "dialogue" && !!line.character;
          const isTracked = line.id === trackedId;
          const isOpen = openLineId === line.id;
          const isSpan = spanFor === line.id;
          const count = noteCountByLine.get(line.id) || 0;

          if (!markable) {
            // Context line (stage direction / setting) — shown, not tappable.
            const blk = blockingByLine.get(line.id);
            return (
              <div key={line.id} className="py-1">
                <p className="text-body-sm text-ash italic leading-relaxed">{line.content}</p>
                {blk?.map((a) => blockingNoteEl(a))}
              </div>
            );
          }

          return (
            <div
              key={line.id}
              ref={(el) => { if (el) lineRefs.current.set(line.id, el); }}
              className={`rounded-card px-3 py-1.5 cursor-pointer transition-colors ${
                isTracked ? "bg-brick/5 ring-1 ring-brick/30" : "hover:bg-bone/40"
              }`}
              onClick={() => {
                setTrackedId(line.id);
                setOpenLineId(isOpen ? null : line.id);
                setSpanFor(null);
              }}
            >
              {showHeader && (
                <p className="font-mono text-data-sm uppercase tracking-wider text-ink font-semibold mt-2 mb-0.5">
                  {line.character}
                  {count > 0 && (
                    <span className="ml-2 text-brick font-normal normal-case tracking-normal">
                      ● {count} note{count > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              )}
              <p className="text-body-md text-ink leading-relaxed">{line.content}</p>

              {blockingByLine.get(line.id)?.map((a) => blockingNoteEl(a))}

              {flash?.lineId === line.id && (
                <p className="text-data-sm text-confirmed mt-1">{flash.text}</p>
              )}
              {isSpan && spanSelectorFor(line)}
              {isOpen && !isSpan && paletteFor(line)}
            </div>
          );
        })}
      </div>

      {/* Pinned tracker bar — one-tap palette for the currently tracked line */}
      {tracked && (
        <div className="fixed bottom-0 left-0 right-0 bg-paper border-t border-bone px-4 py-2.5 print:hidden z-20">
          <div className="max-w-3xl mx-auto">
            <p className="text-body-xs text-muted mb-1.5 truncate">
              <span className="font-mono uppercase tracking-wider text-ink">{tracked.character}</span>
              <span className="ml-2">{tracked.content.length > 70 ? tracked.content.slice(0, 70) + "…" : tracked.content}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => advance(-1)} className="px-2 py-1.5 text-body-sm text-ash hover:text-ink">↑</button>
              {LINE_TYPES.map((t) => (
                <button
                  key={t.value}
                  disabled={saving}
                  onClick={() => {
                    if (t.span) { setOpenLineId(tracked.id); setSpanFor(tracked.id); setSpanWords(new Set()); lineRefs.current.get(tracked.id)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
                    else commit(tracked, t.value, null, "line");
                  }}
                  className="flex-1 px-2 py-1.5 rounded-card bg-ink text-paper text-data-sm font-medium hover:bg-ink/90 disabled:opacity-40"
                >
                  {t.short}
                </button>
              ))}
              <button onClick={() => advance(1)} className="px-2 py-1.5 text-body-sm text-ash hover:text-ink">↓</button>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-data-sm text-muted uppercase tracking-wider px-1">Blk</span>
              {BLOCKING_TYPES.map((t) => (
                <button
                  key={t.value}
                  disabled={saving}
                  onClick={() => commit(tracked, t.value, null, "blocking")}
                  className="flex-1 px-2 py-1.5 rounded-card border border-confirmed/40 bg-card text-confirmed text-data-sm font-medium hover:bg-confirmed/10 disabled:opacity-40"
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverButton({ count, onDeliver }: { count: number; onDeliver: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); await onDeliver(); setBusy(false); }}
      className="px-3 py-1.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50"
    >
      {busy ? "Sending…" : `Deliver ${count} to cast`}
    </button>
  );
}

function ActorNoteGroup({
  title, notes, dimmed, onToggle,
}: {
  title: string;
  notes: LineNote[];
  dimmed?: boolean;
  onToggle?: (id: string, corrected: boolean) => Promise<void>;
}) {
  return (
    <div>
      <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className={`bg-card border border-bone rounded-card p-4 ${dimmed ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-data-sm uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    n.category === "blocking" ? "bg-confirmed/15 text-confirmed" : "bg-brick/10 text-brick"
                  }`}>
                    {n.category === "blocking" ? "Blocking" : "Line"}
                  </span>
                  <span className="text-data-sm text-ash uppercase tracking-wider">{typeLabel(n.note_type)}</span>
                </div>
                {n.category === "blocking" ? (
                  <p className="text-body-md text-ink leading-relaxed mt-1">
                    Should be: <span className="text-ink">{n.content}</span>
                  </p>
                ) : (
                  <p className="text-body-md text-ink leading-relaxed mt-1">
                    {n.marked_text ? <span className="line-through text-brick">{n.marked_text}</span> : n.content}
                  </p>
                )}
                {n.category !== "blocking" && n.marked_text && (
                  <p className="text-body-sm text-ash mt-0.5">in: {n.content}</p>
                )}
                <p className="text-body-xs text-muted mt-1">
                  {[n.scene_ref, n.line_ref].filter(Boolean).join(" · ")}
                  {n.author_name ? ` — ${n.author_name}` : ""} · {timeAgo(n.created_at)}
                </p>
              </div>
              {onToggle && <ToggleGotIt id={n.id} corrected={!!n.corrected_at} onToggle={onToggle} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleGotIt({
  id, corrected, onToggle,
}: {
  id: string;
  corrected: boolean;
  onToggle: (id: string, corrected: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); await onToggle(id, !corrected); setBusy(false); }}
      className={`shrink-0 px-3 py-1.5 rounded-card text-body-xs font-medium transition-colors ${
        corrected
          ? "bg-confirmed/10 text-confirmed border border-confirmed/30"
          : "bg-ink text-paper hover:bg-ink/90"
      } disabled:opacity-50`}
    >
      {corrected ? "✓ Got it" : "Got it"}
    </button>
  );
}
