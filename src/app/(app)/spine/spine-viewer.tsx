"use client";

import { useState, useRef, useEffect, useCallback, useMemo, ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { addAnnotation, deleteAnnotation, updateAnnotation, searchScript } from "./spine-actions";
import { useRouter } from "next/navigation";

// 16 distinct character colors — each character gets a consistent one via hash
const CHARACTER_COLORS: { bg: string; text: string }[] = [
  { bg: "bg-red-100", text: "text-red-700" },
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-purple-100", text: "text-purple-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-lime-100", text: "text-lime-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
  { bg: "bg-yellow-100", text: "text-yellow-700" },
];

function hashCharacter(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % CHARACTER_COLORS.length;
}

function getCharacterColor(name: string) {
  return CHARACTER_COLORS[hashCharacter(name)];
}

// Render annotation content with tagged character names highlighted inline
function renderAnnotationContent(content: string, taggedCharacters: string[]): ReactNode {
  if (!taggedCharacters || taggedCharacters.length === 0) {
    return content;
  }

  // Sort tags longest-first so "QUEEN MOTHER" matches before "QUEEN"
  const sorted = [...taggedCharacters].sort((a, b) => b.length - a.length);
  // Build regex that matches any tagged character name (case-insensitive)
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = content.split(pattern);
  return parts.map((part, i) => {
    const matchedTag = sorted.find(
      (t) => t.toUpperCase() === part.toUpperCase()
    );
    if (matchedTag) {
      const color = getCharacterColor(matchedTag);
      return (
        <span key={i} className={`${color.bg} ${color.text} px-1 py-0 rounded font-mono text-[11px] font-semibold uppercase`}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

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
  tagged_characters: string[];
  visibility: string;
  note_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

type NoteView = "all" | "mine" | "none";

interface SearchResult {
  act: number;
  scene: number;
  line_number: number;
  content: string;
  type: "line" | "note";
}

interface Props {
  lines: ScriptLine[];
  sceneMeta: SceneMeta[];
  annotations: Annotation[];
  scriptTitle: string;
  scriptId: string;
  myCharacters: string[];
  allCharacters: string[];
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
  allCharacters,
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
  const [characterFilter, setCharacterFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [annotatingLineId, setAnnotatingLineId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationTags, setAnnotationTags] = useState<string[]>([]);
  const [annotationIsPersonal, setAnnotationIsPersonal] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const contentRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Build annotation lookup with view filters applied
  const annotationsByLine = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of annotations) {
      let visible = false;

      if (noteView === "none") continue;

      if (noteView === "all") {
        if (characterFilter) {
          // Show only notes tagged with the filtered character
          visible = a.tagged_characters.includes(characterFilter);
        } else {
          visible = true;
        }
      } else if (noteView === "mine") {
        // Show notes tagged with any of my characters
        visible = a.tagged_characters.some((tag) =>
          myCharacters.some(
            (mc) =>
              mc.toUpperCase().includes(tag.toUpperCase()) ||
              tag.toUpperCase().includes(mc.toUpperCase().split(" / ")[0]) ||
              tag.toUpperCase().includes(mc.toUpperCase().split(" / ")[1] || "___NOMATCH___")
          )
        );
        // Also show my own personal notes
        if (!visible && a.visibility === "personal" && a.person_id === personId) {
          visible = true;
        }
      }

      if (!visible) continue;
      if (!map.has(a.script_line_id)) map.set(a.script_line_id, []);
      map.get(a.script_line_id)!.push(a);
    }
    return map;
  }, [annotations, noteView, characterFilter, myCharacters, personId]);

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

  // Realtime subscription
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
            const n = payload.new as Annotation;
            setAnnotations((prev) => {
              if (prev.some((a) => a.id === n.id)) return prev;
              return [...prev, n];
            });
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setAnnotations((prev) => prev.filter((a) => a.id !== oldId));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Annotation;
            setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

  function openAnnotationInput(lineId: string, isPersonal: boolean) {
    setAnnotatingLineId(lineId);
    setAnnotationText("");
    setAnnotationTags([]);
    setAnnotationIsPersonal(isPersonal);
  }

  async function handleAddAnnotation(lineId: string) {
    if (!annotationText.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("script_line_id", lineId);
    fd.set("content", annotationText);
    fd.set("note_type", annotationIsPersonal ? "personal" : "blocking");
    fd.set("visibility", annotationIsPersonal ? "personal" : "production");
    fd.set("tagged_characters", annotationTags.join(","));
    const result = await addAnnotation(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setAnnotationText("");
      setAnnotatingLineId(null);
      router.refresh();
    }
  }

  async function handleUpdateAnnotation(id: string) {
    if (!editText.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("content", editText);
    const result = await updateAnnotation(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setEditingAnnotationId(null);
      setEditText("");
      router.refresh();
    }
  }

  async function handleDeleteAnnotation(id: string) {
    if (!confirm("Delete this note?")) return;
    const result = await deleteAnnotation(id);
    if (result.error) alert(result.error);
    else router.refresh();
  }

  async function handleSearch() {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const results = await searchScript(scriptId, searchQuery);
    const combined: SearchResult[] = [
      ...results.lines.map((l) => ({ act: l.act, scene: l.scene, line_number: l.line_number, content: l.content, type: "line" as const })),
      ...results.annotations.map((a) => ({ act: a.act, scene: a.scene, line_number: a.line_number, content: a.content, type: "note" as const })),
    ].sort((a, b) => a.line_number - b.line_number);
    setSearchResults(combined);
  }

  function jumpToResult(r: SearchResult) {
    setActiveSceneKey(`${r.act}-${r.scene}`);
    setSearchOpen(false);
    setSearchResults(null);
    setSearchQuery("");
  }

  function toggleTag(char: string) {
    setAnnotationTags((prev) =>
      prev.includes(char) ? prev.filter((c) => c !== char) : [...prev, char]
    );
  }

  const sceneIdx = sceneKeys.indexOf(activeSceneKey);

  function getSceneLabel(key: string) {
    const [a, s] = key.split("-").map(Number);
    if (a === 0) return "Title Page";
    return `Scene ${s}`;
  }

  // Page number: sequential index starting at 1
  const pageNumber = sceneIdx + 1;

  // Filter out character_name rows — we auto-generate headers from speaker changes
  const renderableLines = currentLines.filter((l) => l.line_type !== "character_name");

  // Compute scene-relative line numbers (only dialogue + stage_direction count)
  const lineNumberMap = new Map<string, number>();
  let sceneLineNum = 0;
  for (const l of renderableLines) {
    if (["dialogue", "stage_direction", "continued", "setting", "song_title", "lyric", "song_direction", "song"].includes(l.line_type)) {
      sceneLineNum++;
      lineNumberMap.set(l.id, sceneLineNum);
    }
  }

  function getActLabel(act: number) {
    if (act === 0) return "";
    return `Act ${act === 1 ? "I" : "II"}`;
  }

  // Note view labels
  const viewLabels: Record<NoteView, string> = {
    all: characterFilter ? `${characterFilter}` : "All notes",
    mine: "My blocking",
    none: "Clean script",
  };

  return (
    <div className="flex gap-6">
      {/* Desktop sidebar nav */}
      <nav className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-24 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {/* Search */}
          <div>
            <button
              onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-body-sm text-ash hover:text-ink hover:bg-ink/5 transition-colors"
            >
              <span className="text-xs">&#128269;</span> Search script
            </button>
            {searchOpen && (
              <div className="mt-1 space-y-2">
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") { setSearchOpen(false); setSearchResults(null); } }}
                  placeholder="Lines or notes..."
                  className="w-full px-2 py-1.5 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
                />
                {searchResults && (
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {searchResults.length === 0 && <p className="text-body-xs text-muted px-2">No results</p>}
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => jumpToResult(r)}
                        className="block w-full text-left px-2 py-1.5 rounded text-body-xs hover:bg-ink/5 transition-colors"
                      >
                        <span className="font-mono text-muted">{r.act > 0 ? `${r.act}.${r.scene}` : "FM"}</span>
                        <span className={`ml-1 ${r.type === "note" ? "text-brick italic" : "text-ink"}`}>
                          {r.content.slice(0, 60)}{r.content.length > 60 ? "..." : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scene nav */}
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
                  onClick={() => { setNoteView(view); if (view !== "all") setCharacterFilter(null); }}
                  className={`block w-full text-left px-2 py-1.5 rounded text-body-sm transition-colors ${
                    noteView === view
                      ? "bg-brick/10 text-brick font-medium"
                      : "text-ash hover:text-ink hover:bg-ink/5"
                  }`}
                >
                  {view === "all" ? "All notes" : view === "mine" ? "My blocking" : "Clean script"}
                </button>
              ))}
            </div>
          </div>

          {/* Character filter (staff + anyone in all-notes mode) */}
          {noteView === "all" && (
            <div className="pt-2">
              <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">
                Filter by character
              </h3>
              <select
                value={characterFilter || ""}
                onChange={(e) => setCharacterFilter(e.target.value || null)}
                className="w-full px-2 py-1.5 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
              >
                <option value="">All characters</option>
                {allCharacters.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile FABs */}
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
          {actNum > 0 ? `Act ${actNum === 1 ? "I" : "II"} · Scene ${sceneNum}` : "Scenes"}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {showNav && (
        <div className="lg:hidden fixed inset-0 bg-ink/40 z-40" onClick={() => setShowNav(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-paper rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-bone rounded mx-auto mb-4" />
            {/* Mobile search */}
            <div className="mb-3">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Search lines or notes..."
                className="w-full px-3 py-2 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
              />
              {searchResults && searchResults.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => jumpToResult(r)} className="block w-full text-left px-3 py-2 text-body-xs hover:bg-ink/5">
                      <span className="font-mono text-muted">{r.act}.{r.scene}</span>{" "}
                      <span className={r.type === "note" ? "text-brick italic" : "text-ink"}>{r.content.slice(0, 50)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Mobile character filter */}
            {noteView === "all" && (
              <div className="mb-3">
                <select
                  value={characterFilter || ""}
                  onChange={(e) => setCharacterFilter(e.target.value || null)}
                  className="w-full px-3 py-2 bg-card border border-bone rounded text-body-sm text-ink"
                >
                  <option value="">All characters</option>
                  {allCharacters.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
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
                      onClick={() => { setActiveSceneKey(key); setShowNav(false); }}
                      className={`block w-full text-left px-3 py-2.5 rounded text-body-md ${
                        key === activeSceneKey ? "bg-ink/10 text-ink font-medium" : "text-ash"
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
          <div className="flex items-center justify-between">
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
            <span className="font-mono text-data-sm text-muted">p. {pageNumber}</span>
          </div>
          {currentMeta?.setting && (
            <p className="text-body-sm text-ash mt-2 italic">{currentMeta.setting}</p>
          )}
          {/* Active filter indicator */}
          {characterFilter && noteView === "all" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brick/10 text-brick text-body-xs rounded-full font-medium">
                {characterFilter}
                <button onClick={() => setCharacterFilter(null)} className="hover:text-brick/70">&times;</button>
              </span>
            </div>
          )}
        </div>

        {/* Script lines */}
        <div className="space-y-0.5 pb-12">
          {renderableLines.map((line, idx) => {
            const lineAnnotations = annotationsByLine.get(line.id) || [];
            const hasAnnotations = lineAnnotations.length > 0;
            const isAnnotating = annotatingLineId === line.id;
            const canAddHere = canManage || (line.character && isMyCharacter(line.character || ""));
            const sceneLineNo = lineNumberMap.get(line.id);

            // Auto-detect speaker changes for character name headers
            const prevLine = idx > 0 ? renderableLines[idx - 1] : null;
            const showCharacterHeader =
              line.line_type === "dialogue" &&
              line.character &&
              (!prevLine ||
                prevLine.character !== line.character ||
                prevLine.line_type === "stage_direction" ||
                prevLine.line_type === "setting" ||
                prevLine.line_type === "song_title" ||
                prevLine.line_type === "song" ||
                prevLine.line_type === "song_direction");

            return (
              <div key={line.id} className="group relative">
                {/* Auto-generated character name header */}
                {showCharacterHeader && (
                  <p className={`font-mono text-data-sm uppercase tracking-wider mt-6 mb-0.5 ${
                    isMyCharacter(line.character!) ? "text-brick font-bold" : "text-ink font-semibold"
                  }`}>
                    {line.character}
                  </p>
                )}

                {/* The line itself with gutter line number */}
                <div
                  className={`relative flex ${canAddHere ? "cursor-pointer" : ""} ${
                    hasAnnotations && noteView !== "none" ? "border-l-2 border-brick/30 pl-3" : ""
                  }`}
                  onClick={() => {
                    if (canAddHere && !isAnnotating) {
                      openAnnotationInput(line.id, !canManage);
                      if (line.character && !line.character.includes(" / ")) {
                        setAnnotationTags([line.character]);
                      }
                    }
                  }}
                >
                  {/* Line number gutter */}
                  {sceneLineNo && (
                    <span className="w-6 shrink-0 text-right mr-2 font-mono text-[10px] text-bone select-none leading-relaxed">
                      {sceneLineNo}
                    </span>
                  )}

                  {/* Add note indicator */}
                  {canAddHere && (
                    <span className="absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted text-body-xs select-none">
                      +
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    {renderLine(line, isMyCharacter)}
                  </div>
                </div>

                {/* Annotations on this line */}
                {noteView !== "none" && lineAnnotations.map((a) => {
                  const isEditing = editingAnnotationId === a.id;
                  const isPersonal = a.visibility === "personal";
                  const canEdit = canManage || (isPersonal && a.person_id === personId);

                  return (
                    <div
                      key={a.id}
                      className={`ml-4 mt-1 mb-2 px-3 py-1.5 rounded-r text-body-sm flex flex-col gap-1 ${
                        isPersonal
                          ? "bg-blue-50 border-l-2 border-blue-400/40 dark:bg-blue-950/20"
                          : a.is_pinned
                          ? "bg-amber-50 border-l-2 border-amber-400/60 dark:bg-amber-950/20"
                          : "bg-brick/5 border-l-2 border-brick/40"
                      }`}
                    >
                      {/* Pin + personal indicator (compact) */}
                      {(a.is_pinned || isPersonal) && (
                        <div className="flex items-center gap-1 mb-0.5">
                          {a.is_pinned && <span className="text-amber-600 text-body-xs">📌</span>}
                          {isPersonal && <span className="text-blue-500 text-body-xs font-medium">Personal</span>}
                        </div>
                      )}

                      {/* Content with inline character highlighting + actions */}
                      <div className="flex items-start gap-2">
                        {isEditing ? (
                          <div className="flex-1">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleUpdateAnnotation(a.id); }
                                if (e.key === "Escape") { setEditingAnnotationId(null); setEditText(""); }
                              }}
                              className="w-full px-2 py-1 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none resize-none"
                              rows={2}
                            />
                            <div className="flex gap-2 mt-1">
                              <button onClick={() => handleUpdateAnnotation(a.id)} disabled={saving} className="text-body-xs font-medium text-brick">{saving ? "Saving…" : "Save"}</button>
                              <button onClick={() => { setEditingAnnotationId(null); setEditText(""); }} className="text-body-xs text-muted hover:text-ink">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <span className={`flex-1 ${isPersonal ? "text-blue-700 dark:text-blue-300" : "text-ash"} italic text-body-sm leading-relaxed`}>
                            {renderAnnotationContent(a.content, a.tagged_characters)}
                          </span>
                        )}

                        {canEdit && !isEditing && (
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingAnnotationId(a.id); setEditText(a.content); }}
                              className="text-muted hover:text-ink text-body-xs"
                              title="Edit"
                            >
                              &#9998;
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(a.id); }}
                              className="text-muted hover:text-conflict text-body-xs"
                              title="Delete"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Annotation input */}
                {isAnnotating && (
                  <div className="ml-4 mt-1 mb-3" onClick={(e) => e.stopPropagation()}>
                    <div className={`p-3 rounded border ${annotationIsPersonal ? "border-blue-300 bg-blue-50/50" : "border-bone bg-card"}`}>
                      {annotationIsPersonal && (
                        <p className="text-body-xs text-blue-600 font-medium mb-2">
                          Personal note — visible to you and production staff only
                        </p>
                      )}
                      <textarea
                        ref={annotationInputRef}
                        value={annotationText}
                        onChange={(e) => setAnnotationText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddAnnotation(line.id); }
                          if (e.key === "Escape") { setAnnotatingLineId(null); setAnnotationText(""); }
                        }}
                        placeholder={annotationIsPersonal ? "Your personal note…" : "Blocking note… (Enter to save, Esc to cancel)"}
                        className="w-full px-2 py-1.5 bg-transparent border-b border-bone text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none"
                        rows={2}
                      />

                      {/* Character tags (staff only) */}
                      {canManage && !annotationIsPersonal && (
                        <div className="mt-2">
                          <p className="text-body-xs text-muted mb-1">Tag characters:</p>
                          <div className="flex flex-wrap gap-1">
                            {allCharacters.map((c) => {
                              const color = getCharacterColor(c);
                              const selected = annotationTags.includes(c);
                              return (
                                <button
                                  key={c}
                                  onClick={() => toggleTag(c)}
                                  className={`px-1.5 py-0.5 text-[10px] font-mono uppercase rounded transition-colors font-semibold ${
                                    selected
                                      ? `${color.bg} ${color.text} ring-1 ring-current`
                                      : "bg-bone/50 text-ash hover:bg-bone"
                                  }`}
                                >
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleAddAnnotation(line.id)}
                          disabled={saving || !annotationText.trim()}
                          className="text-body-xs font-medium text-brick hover:text-brick/80 disabled:opacity-40"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setAnnotatingLineId(null); setAnnotationText(""); }}
                          className="text-body-xs text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
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
            p. {pageNumber} of {sceneKeys.length}
          </span>
          <button
            onClick={() => setActiveSceneKey(sceneKeys[Math.min(sceneKeys.length - 1, sceneIdx + 1)])}
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

function renderLine(line: ScriptLine, isMyCharacter: (name: string) => boolean) {
  switch (line.line_type) {
    case "character_name":
      // Handled by auto-detection above — skip rendering
      return null;
    case "stage_direction":
      return <p className="text-body-sm text-ash italic pl-4">{line.content}</p>;
    case "continued":
      return <p className="text-body-xs text-muted italic pl-4">{line.content}</p>;
    case "setting":
      return <p className="text-body-sm text-ash italic mt-4 mb-2">{line.content}</p>;
    case "song_title":
    case "song":
      return <p className="text-body-md font-medium text-ink mt-6 mb-1 italic">{line.content}</p>;
    case "song_direction":
      return <p className="text-body-xs text-muted uppercase tracking-wider mt-3 mb-1">{line.content}</p>;
    case "lyric":
      return <p className="text-body-sm text-ash italic pl-6">{line.content}</p>;
    default:
      return <p className="text-body-md text-ink leading-relaxed">{line.content}</p>;
  }
}
