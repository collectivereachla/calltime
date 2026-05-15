"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { addAnnotation, deleteAnnotation } from "./spine-actions";
import { useRouter } from "next/navigation";

interface ScriptLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
}

interface SceneMeta {
  act: number;
  scene: number;
  title: string | null;
  setting: string | null;
}

interface Annotation {
  id: string;
  script_line_id: string;
  person_id: string;
  annotation_type: string;
  content: string;
  target_character: string | null;
  created_at: string;
  updated_at: string;
}

type NoteView = "all" | "mine" | "none";

interface Props {
  lines: ScriptLine[];
  sceneMeta: SceneMeta[];
  annotations: Annotation[];
  scriptTitle: string;
  scriptId: string;
  myCharacters: string[];
  canManage: boolean;
  personId: string;
}

export function SpineViewer({
  lines,
  sceneMeta,
  annotations: initialAnnotations,
  scriptTitle,
  scriptId,
  myCharacters,
  canManage,
  personId,
}: Props) {
  // Group lines by act.scene
  const sceneKeys: string[] = [];
  const sceneMap = new Map<string, ScriptLine[]>();
  for (const line of lines) {
    const key = `${line.act}-${line.scene}`;
    if (!sceneMap.has(key)) {
      sceneKeys.push(key);
      sceneMap.set(key, []);
    }
    sceneMap.get(key)!.push(line);
  }

  const [activeSceneKey, setActiveSceneKey] = useState(sceneKeys[0] || "0-0");
  const [showNav, setShowNav] = useState(false);
  const [noteView, setNoteView] = useState<NoteView>("all");
  const [annotatingLineId, setAnnotatingLineId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const contentRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Group scenes by act for nav
  const actGroups = new Map<number, string[]>();
  for (const key of sceneKeys) {
    const [act] = key.split("-").map(Number);
    if (!actGroups.has(act)) actGroups.set(act, []);
    actGroups.get(act)!.push(key);
  }

  const currentLines = sceneMap.get(activeSceneKey) || [];
  const [actNum, sceneNum] = activeSceneKey.split("-").map(Number);
  const currentMeta = sceneMeta.find((s) => s.act === actNum && s.scene === sceneNum);

  // Build annotation lookup: lineId -> Annotation[]
  const annotationsByLine = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const visible =
      noteView === "all" ||
      (noteView === "mine" && a.person_id === personId);
    if (!visible) continue;
    if (!annotationsByLine.has(a.script_line_id)) {
      annotationsByLine.set(a.script_line_id, []);
    }
    annotationsByLine.get(a.script_line_id)!.push(a);
  }

  // Scroll to top on scene change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeSceneKey]);

  // Focus annotation input when opened
  useEffect(() => {
    if (annotatingLineId) {
      setTimeout(() => annotationInputRef.current?.focus(), 50);
    }
  }, [annotatingLineId]);

  // Realtime subscription for annotations
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel("spine-annotations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "script_annotations" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newAnnotation = payload.new as Annotation;
            setAnnotations((prev) => {
              if (prev.some((a) => a.id === newAnnotation.id)) return prev;
              return [...prev, newAnnotation];
            });
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setAnnotations((prev) => prev.filter((a) => a.id !== oldId));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Annotation;
            setAnnotations((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isMyCharacter = useCallback(
    (name: string) => {
      return myCharacters.some(
        (c) =>
          name.toUpperCase().includes(c.toUpperCase().split(" / ")[0]) ||
          name.toUpperCase().includes(c.toUpperCase().split(" / ")[1] || "___NOMATCH___")
      );
    },
    [myCharacters]
  );

  async function handleAddAnnotation(lineId: string) {
    if (!annotationText.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("script_line_id", lineId);
    fd.set("content", annotationText);
    fd.set("annotation_type", "blocking");
    const result = await addAnnotation(fd);
    setSaving(false);
    if (result.error) {
      alert(result.error);
    } else {
      setAnnotationText("");
      setAnnotatingLineId(null);
      router.refresh();
    }
  }

  async function handleDeleteAnnotation(id: string) {
    const result = await deleteAnnotation(id);
    if (result.error) alert(result.error);
    else router.refresh();
  }

  const sceneIdx = sceneKeys.indexOf(activeSceneKey);

  function getSceneLabel(key: string) {
    const [a, s] = key.split("-").map(Number);
    if (a === 0) return "Front Matter";
    return `Scene ${s}`;
  }

  function getActLabel(act: number) {
    if (act === 0) return "";
    return `Act ${act === 1 ? "I" : "II"}`;
  }

  return (
    <div className="flex gap-6">
      {/* Desktop sidebar nav */}
      <nav className="hidden lg:block w-48 shrink-0">
        <div className="sticky top-24 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {Array.from(actGroups.entries()).map(([act, keys]) => (
            <div key={act}>
              {act > 0 && (
                <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-1">
                  {getActLabel(act)}
                </h3>
              )}
              <div className="space-y-0.5">
                {keys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveSceneKey(key)}
                    className={`block w-full text-left px-2 py-1.5 rounded text-body-sm transition-colors ${
                      key === activeSceneKey
                        ? "bg-ink/10 text-ink font-medium"
                        : "text-ash hover:text-ink hover:bg-ink/5"
                    }`}
                  >
                    {getSceneLabel(key)}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* View toggle */}
          <div className="pt-4 border-t border-bone">
            <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">
              Notes
            </h3>
            <div className="space-y-1">
              {(["all", "mine", "none"] as NoteView[]).map((view) => (
                <button
                  key={view}
                  onClick={() => setNoteView(view)}
                  className={`block w-full text-left px-2 py-1.5 rounded text-body-sm transition-colors ${
                    noteView === view
                      ? "bg-brick/10 text-brick font-medium"
                      : "text-ash hover:text-ink hover:bg-ink/5"
                  }`}
                >
                  {view === "all" ? "All notes" : view === "mine" ? "My notes" : "Hide notes"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile scene nav */}
      <div className="lg:hidden fixed bottom-20 right-4 z-30 flex gap-2">
        <button
          onClick={() => setNoteView(noteView === "none" ? "all" : noteView === "all" ? "mine" : "none")}
          className="bg-card text-ash border border-bone px-3 py-2 rounded-full text-body-xs font-medium shadow-lg"
        >
          {noteView === "all" ? "📝 All" : noteView === "mine" ? "📝 Mine" : "📝 Off"}
        </button>
        <button
          onClick={() => setShowNav(!showNav)}
          className="bg-ink text-paper px-3 py-2 rounded-full text-body-sm font-medium shadow-lg"
        >
          {actNum > 0
            ? `Act ${actNum === 1 ? "I" : "II"} · Scene ${sceneNum}`
            : "Scenes"}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {showNav && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/40 z-40"
          onClick={() => setShowNav(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-paper rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-bone rounded mx-auto mb-4" />
            {Array.from(actGroups.entries()).map(([act, keys]) => (
              <div key={act} className="mb-3">
                {act > 0 && (
                  <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-1 px-2">
                    {getActLabel(act)}
                  </h3>
                )}
                <div className="space-y-0.5">
                  {keys.map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveSceneKey(key);
                        setShowNav(false);
                      }}
                      className={`block w-full text-left px-3 py-2.5 rounded text-body-md ${
                        key === activeSceneKey
                          ? "bg-ink/10 text-ink font-medium"
                          : "text-ash"
                      }`}
                    >
                      {getSceneLabel(key)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Script content */}
      <div ref={contentRef} className="flex-1 min-w-0">
        {/* Scene header */}
        <div className="mb-6 pb-4 border-b border-bone">
          <div className="flex items-center gap-3">
            <span className="font-mono text-data-sm text-muted">
              {actNum > 0
                ? `Act ${actNum === 1 ? "I" : "II"} · Scene ${sceneNum}`
                : scriptTitle}
            </span>
            {currentMeta?.title && (
              <span className="text-body-sm text-ash">— {currentMeta.title}</span>
            )}
          </div>
          {currentMeta?.setting && (
            <p className="text-body-sm text-ash mt-2 italic">{currentMeta.setting}</p>
          )}
        </div>

        {/* Script lines */}
        <div className="space-y-0.5 pb-12">
          {currentLines.map((line) => {
            const lineAnnotations = annotationsByLine.get(line.id) || [];
            const hasAnnotations = lineAnnotations.length > 0;
            const isAnnotating = annotatingLineId === line.id;

            return (
              <div key={line.id} className="group relative">
                {/* The line itself */}
                <div
                  className={`relative ${canManage ? "cursor-pointer" : ""} ${
                    hasAnnotations && noteView !== "none" ? "border-l-2 border-brick/30 pl-3" : ""
                  }`}
                  onClick={() => {
                    if (canManage && !isAnnotating) {
                      setAnnotatingLineId(line.id);
                      setAnnotationText("");
                    }
                  }}
                >
                  {/* Add note indicator for SM */}
                  {canManage && (
                    <span className="absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted text-body-xs select-none">
                      +
                    </span>
                  )}

                  {renderLine(line, isMyCharacter)}
                </div>

                {/* Annotations on this line */}
                {noteView !== "none" && lineAnnotations.map((a) => (
                  <div
                    key={a.id}
                    className="ml-4 mt-1 mb-2 px-3 py-1.5 bg-brick/5 border-l-2 border-brick/40 rounded-r text-body-sm text-ash italic flex items-start gap-2"
                  >
                    <span className="flex-1">{a.content}</span>
                    {canManage && a.person_id === personId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(a.id);
                        }}
                        className="text-muted hover:text-conflict text-body-xs shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {/* Annotation input */}
                {isAnnotating && (
                  <div className="ml-4 mt-1 mb-3" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      ref={annotationInputRef}
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddAnnotation(line.id);
                        }
                        if (e.key === "Escape") {
                          setAnnotatingLineId(null);
                          setAnnotationText("");
                        }
                      }}
                      placeholder="Blocking note… (Enter to save, Esc to cancel)"
                      className="w-full px-3 py-2 bg-card border border-bone rounded text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => handleAddAnnotation(line.id)}
                        disabled={saving || !annotationText.trim()}
                        className="text-body-xs font-medium text-brick hover:text-brick/80 disabled:opacity-40"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setAnnotatingLineId(null);
                          setAnnotationText("");
                        }}
                        className="text-body-xs text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Prev/Next */}
        <div className="flex items-center justify-between pt-4 border-t border-bone">
          <button
            onClick={() => setActiveSceneKey(sceneKeys[Math.max(0, sceneIdx - 1)])}
            disabled={sceneIdx === 0}
            className="text-body-sm text-ash hover:text-ink disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            ← Previous
          </button>
          <span className="font-mono text-data-sm text-muted">
            {sceneIdx + 1} / {sceneKeys.length}
          </span>
          <button
            onClick={() =>
              setActiveSceneKey(sceneKeys[Math.min(sceneKeys.length - 1, sceneIdx + 1)])
            }
            disabled={sceneIdx === sceneKeys.length - 1}
            className="text-body-sm text-ash hover:text-ink disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function renderLine(
  line: ScriptLine,
  isMyCharacter: (name: string) => boolean
) {
  switch (line.line_type) {
    case "character_name":
      return (
        <p
          className={`font-mono text-data-sm uppercase tracking-wider mt-6 mb-0.5 ${
            line.character && isMyCharacter(line.character)
              ? "text-brick font-bold"
              : "text-ink font-semibold"
          }`}
        >
          {line.character || line.content}
        </p>
      );
    case "stage_direction":
      return (
        <p className="text-body-sm text-ash italic pl-4">
          {line.content}
        </p>
      );
    case "continued":
      return (
        <p className="text-body-xs text-muted italic pl-4">
          {line.content}
        </p>
      );
    case "setting":
      return (
        <p className="text-body-sm text-ash italic mt-4 mb-2">
          {line.content}
        </p>
      );
    case "song_title":
      return (
        <p className="text-body-md font-medium text-ink mt-6 mb-1 italic">
          {line.content}
        </p>
      );
    case "song_direction":
      return (
        <p className="text-body-xs text-muted uppercase tracking-wider mt-3 mb-1">
          {line.content}
        </p>
      );
    case "lyric":
      return (
        <p className="text-body-sm text-ash italic pl-6">
          {line.content}
        </p>
      );
    default: // dialogue
      return (
        <p className="text-body-md text-ink leading-relaxed">
          {line.content}
        </p>
      );
  }
}
