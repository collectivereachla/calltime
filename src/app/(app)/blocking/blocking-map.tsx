"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveMoment, deleteMoment, savePositions, savePositionAndAnnotation, seedBlockingFromNotes } from "./actions";

// ── Types ──

interface Scene { id: string; act: number; scene_number: number; title: string | null; }
interface ScriptLine { id: string; lineNumber: number; act: number; scene: number; character: string | null; content: string; lineType: string; }
interface Moment { id: string; scene_id: string | null; script_line_id: string | null; sort_order: number; label: string; notes: string | null; }
interface Position { character_name: string; x: number; y: number; on_stage: boolean; stage_area: string | null; entrance_from: string | null; exit_to: string | null; }
interface StageConfig { venue_name: string | null; stage_width: number; stage_depth: number; set_pieces: SetPiece[]; seating_layout: SeatingLayout; stage_areas: StageArea[]; }
interface SetPiece { name: string; type: string; x: number; y: number; width: number; height: number; label: string; raised?: boolean; offstage?: boolean; }
interface SeatingLayout { sections: { name: string; label: string; x: number; y: number; width: number; height: number }[]; walkway: { y: number; height: number; label: string }; aisles: { name: string; label: string; x: number; side: string }[]; }
interface StageArea { name: string; x: number; y: number; }
interface CastAssignment { role: string; actorName: string; }

interface Props {
  production: { id: string; title: string };
  scenes: Scene[];
  characters: string[];
  stageConfig: StageConfig | null;
  moments: Moment[];
  positionsByMoment: Record<string, Position[]>;
  scriptLines: ScriptLine[];
  castAssignments: CastAssignment[];
  canManage: boolean;
}

// Character colors — consistent palette
const CHAR_COLORS: Record<string, string> = {};
const PALETTE = ["#534AB7","#1D9E75","#D85A30","#378ADD","#639922","#BA7517","#993556","#D4537E","#854F0B","#185FA5","#3B6D11","#993C1D","#5F5E5A","#A32D2D","#72243E","#0F6E56","#3C3489","#712B13"];
function getColor(name: string): string {
  if (!CHAR_COLORS[name]) {
    CHAR_COLORS[name] = PALETTE[Object.keys(CHAR_COLORS).length % PALETTE.length];
  }
  return CHAR_COLORS[name];
}
function initials(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
}

// Stage area detection from normalized coordinates
function detectStageArea(x: number, y: number, stageAreas: StageArea[]): string {
  let closest = "CS";
  let minDist = Infinity;
  for (const a of stageAreas) {
    if (a.name.includes("wing") || a.name === "HL" || a.name === "HR") continue;
    const dx = x - a.x;
    const dy = y - a.y;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; closest = a.name; }
  }
  return closest;
}

// ── Component ──

type Mode = "edit" | "playback" | "actor";

export function BlockingMap({ production, scenes, characters, stageConfig, moments: initialMoments, positionsByMoment: initialPositions, scriptLines, castAssignments, canManage }: Props) {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(canManage ? "edit" : "playback");
  const [selectedScene, setSelectedScene] = useState<string | null>(scenes[0]?.id || null);
  const [currentMomentIdx, setCurrentMomentIdx] = useState(0);
  const [localMoments, setLocalMoments] = useState(initialMoments);
  const [localPositions, setLocalPositions] = useState(initialPositions);
  const [actorFilter, setActorFilter] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [draftNote, setDraftNote] = useState<{ character: string; from: string; to: string; text: string; lineId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddMoment, setShowAddMoment] = useState(false);
  const [newMomentLabel, setNewMomentLabel] = useState("");
  const [newMomentLineId, setNewMomentLineId] = useState("");

  const sceneMoments = localMoments.filter((m) => !selectedScene || m.scene_id === selectedScene);
  const currentMoment = sceneMoments[currentMomentIdx];
  const currentPositions = currentMoment ? (localPositions[currentMoment.id] || []) : [];
  const stageAreas = stageConfig?.stage_areas || [];
  const sceneLines = scriptLines.filter((l) => {
    if (!selectedScene) return true;
    const scene = scenes.find((s) => s.id === selectedScene);
    return scene && l.act === scene.act && l.scene === scene.scene_number;
  });

  // Get position for a character in current moment (or from drag)
  function getCharPos(name: string): { x: number; y: number; on_stage: boolean } {
    if (dragging === name && dragPos) return { x: dragPos.x, y: dragPos.y, on_stage: true };
    const pos = currentPositions.find((p) => p.character_name === name);
    if (pos) return { x: pos.x, y: pos.y, on_stage: pos.on_stage };
    return { x: 0.05, y: 0.35, on_stage: false };
  }

  // Pointer events for dragging
  const handlePointerDown = useCallback((char: string, e: React.PointerEvent) => {
    if (mode !== "edit" || !canManage) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(char);
  }, [mode, canManage]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragPos({ x, y });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    if (!dragging || !dragPos || !currentMoment) { setDragging(null); setDragPos(null); return; }
    const fromPos = currentPositions.find((p) => p.character_name === dragging);
    const fromArea = fromPos ? detectStageArea(fromPos.x, fromPos.y, stageAreas) : "offstage";
    const toArea = detectStageArea(dragPos.x, dragPos.y, stageAreas);
    const isEntrance = !fromPos || !fromPos.on_stage;
    const verb = isEntrance ? "enters" : "crosses to";
    const text = `${dragging} ${verb} ${toArea}${isEntrance && fromArea !== "offstage" ? ` from ${fromArea}` : ""}`;
    setDraftNote({ character: dragging, from: fromArea, to: toArea, text, lineId: currentMoment.script_line_id || undefined });
    setDragging(null);
  }, [dragging, dragPos, currentMoment, currentPositions, stageAreas]);

  // Save draft note + position
  async function confirmDraftNote() {
    if (!draftNote || !currentMoment || !dragPos) return;
    setSaving(true);
    const result = await savePositionAndAnnotation({
      momentId: currentMoment.id,
      characterName: draftNote.character,
      x: dragPos.x, y: dragPos.y,
      onStage: true,
      stageArea: draftNote.to,
      entranceFrom: draftNote.from === "offstage" ? draftNote.from : undefined,
      noteContent: draftNote.text,
      scriptLineId: draftNote.lineId,
      productionId: production.id,
    });
    setSaving(false);
    if (result.error) { alert(result.error); return; }
    // Update local state
    const newPos = [...(localPositions[currentMoment.id] || []).filter((p) => p.character_name !== draftNote.character),
      { character_name: draftNote.character, x: dragPos.x, y: dragPos.y, on_stage: true, stage_area: draftNote.to, entrance_from: null, exit_to: null }];
    setLocalPositions({ ...localPositions, [currentMoment.id]: newPos });
    setDraftNote(null);
    setDragPos(null);
  }

  function dismissDraftNote() {
    setDraftNote(null);
    setDragPos(null);
  }

  // Create new moment
  async function handleCreateMoment() {
    if (!newMomentLabel.trim()) return;
    setSaving(true);
    const result = await saveMoment({
      productionId: production.id,
      sceneId: selectedScene || undefined,
      scriptLineId: newMomentLineId || undefined,
      label: newMomentLabel,
      sortOrder: sceneMoments.length,
    });
    setSaving(false);
    if (result.error) { alert(result.error); return; }
    const newMoment: Moment = {
      id: result.id!, scene_id: selectedScene, script_line_id: newMomentLineId || null,
      sort_order: sceneMoments.length, label: newMomentLabel, notes: null,
    };
    setLocalMoments([...localMoments, newMoment]);
    setLocalPositions({ ...localPositions, [newMoment.id]: [] });
    setCurrentMomentIdx(sceneMoments.length);
    setShowAddMoment(false);
    setNewMomentLabel("");
    setNewMomentLineId("");
  }

  // Delete moment
  async function handleDeleteMoment() {
    if (!currentMoment || !confirm("Delete this moment?")) return;
    await deleteMoment(currentMoment.id);
    setLocalMoments(localMoments.filter((m) => m.id !== currentMoment.id));
    const { [currentMoment.id]: _, ...rest } = localPositions;
    setLocalPositions(rest);
    setCurrentMomentIdx(Math.max(0, currentMomentIdx - 1));
  }

  // Playback auto-advance
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (currentMomentIdx < sceneMoments.length - 1) setCurrentMomentIdx(currentMomentIdx + 1);
      else setPlaying(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [playing, currentMomentIdx, sceneMoments.length]);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && currentMomentIdx > 0) setCurrentMomentIdx(currentMomentIdx - 1);
      if (e.key === "ArrowRight" && currentMomentIdx < sceneMoments.length - 1) setCurrentMomentIdx(currentMomentIdx + 1);
      if (e.key === " " && mode === "playback") { e.preventDefault(); setPlaying(!playing); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentMomentIdx, sceneMoments.length, mode, playing]);

  const inputClass = "w-full px-3 py-2 bg-card border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

  return (
    <div className="min-h-screen bg-paper flex flex-col" style={{ touchAction: "none" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bone bg-card">
        <div className="flex items-center gap-3">
          <a href="/run" className="text-body-sm text-muted hover:text-ink transition-colors">← Run</a>
          <span className="font-display text-body-lg">Blocking Map</span>
          <span className="text-body-xs text-muted">{production.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {(["edit", "playback", "actor"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m !== "actor") setActorFilter(null); }}
              className={`px-3 py-1 text-body-xs rounded-full transition-colors ${mode === m ? "bg-ink text-paper" : "text-ash hover:text-ink"}`}>
              {m === "edit" ? "Edit" : m === "playback" ? "Play" : "Actor"}
            </button>
          ))}
        </div>
      </div>

      {/* Scene selector + Import + Actor filter */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-bone/50 bg-card/50 overflow-x-auto">
        <select value={selectedScene || ""} onChange={(e) => { setSelectedScene(e.target.value || null); setCurrentMomentIdx(0); }}
          className="text-body-sm bg-transparent border-none text-ink focus:outline-none cursor-pointer">
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>Act {s.act}, Sc {s.scene_number}{s.title ? `: ${s.title}` : ""}</option>
          ))}
        </select>
        {mode === "edit" && canManage && selectedScene && sceneMoments.length === 0 && (
          <button onClick={async () => {
            setSaving(true);
            const result = await seedBlockingFromNotes(production.id, selectedScene);
            setSaving(false);
            if (result.error) alert(result.error);
            else router.refresh();
          }} disabled={saving}
            className="px-3 py-1 text-body-xs font-medium bg-brick text-paper rounded-card hover:bg-brick/90 disabled:opacity-50 shrink-0 ml-auto">
            {saving ? "Importing..." : "Import from blocking notes"}
          </button>
        )}
        {mode === "actor" && (
          <select value={actorFilter || ""} onChange={(e) => setActorFilter(e.target.value || null)}
            className="text-body-sm bg-transparent border-none text-ink focus:outline-none cursor-pointer ml-auto">
            <option value="">All characters</option>
            {characters.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden" ref={mapRef}
        onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => { setDragging(null); setDragPos(null); }}>

        {/* Ground plan SVG */}
        <svg viewBox="0 0 1000 750" className="w-full h-full" style={{ maxHeight: "calc(100vh - 240px)" }} preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="stageGrid" width="33.3" height="33.3" patternUnits="userSpaceOnUse">
              <path d="M33.3 0L0 0 0 33.3" fill="none" stroke="var(--color-bone)" strokeWidth=".4" opacity=".5"/>
            </pattern>
          </defs>

          {/* Stage area */}
          <rect x="80" y="20" width="840" height="460" fill="url(#stageGrid)" rx="4"/>
          <rect x="80" y="20" width="840" height="460" fill="none" stroke="var(--color-bone)" strokeWidth="1" rx="4"/>

          {/* CYC */}
          <line x1="80" y1="45" x2="920" y2="45" stroke="var(--color-bone)" strokeWidth=".5" strokeDasharray="8,5"/>
          <text x="95" y="40" fontSize="9" fill="var(--color-muted)">CYC</text>

          {/* House/Porch — 16' wide centered, 4' porch + wall + 4' behind */}
          <rect x="340" y="50" width="320" height="80" rx="3" fill="var(--color-paper)" stroke="var(--color-ash)" strokeWidth="1.5"/>
          <line x1="340" y1="90" x2="660" y2="90" stroke="var(--color-ash)" strokeWidth="1" strokeDasharray="4,3"/>
          <rect x="480" y="87" width="40" height="6" fill="var(--color-paper)" stroke="var(--color-ash)" strokeWidth=".8" rx="1"/>
          <text x="500" y="72" textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--color-ash)">HOUSE</text>
          <text x="500" y="84" textAnchor="middle" fontSize="8" fill="var(--color-muted)">16" raised</text>
          <rect x="340" y="130" width="320" height="30" rx="2" fill="var(--color-bone)" fillOpacity=".3" stroke="var(--color-ash)" strokeWidth=".8"/>
          <text x="500" y="149" textAnchor="middle" fontSize="9" fill="var(--color-ash)">PORCH (4&apos; deep)</text>

          {/* Wings */}
          <rect x="30" y="120" width="50" height="180" fill="none" stroke="var(--color-bone)" strokeWidth=".5" strokeDasharray="5,4" rx="3"/>
          <text x="55" y="215" textAnchor="middle" fontSize="8" fill="var(--color-muted)">SR</text>
          <text x="55" y="225" textAnchor="middle" fontSize="7" fill="var(--color-muted)">wing</text>
          <rect x="920" y="120" width="50" height="180" fill="none" stroke="var(--color-bone)" strokeWidth=".5" strokeDasharray="5,4" rx="3"/>
          <text x="945" y="215" textAnchor="middle" fontSize="8" fill="var(--color-muted)">SL</text>
          <text x="945" y="225" textAnchor="middle" fontSize="7" fill="var(--color-muted)">wing</text>

          {/* DS Wings */}
          <rect x="30" y="340" width="50" height="140" fill="none" stroke="var(--color-bone)" strokeWidth=".5" strokeDasharray="5,4" rx="3"/>
          <text x="55" y="415" textAnchor="middle" fontSize="7" fill="var(--color-muted)">DS wing</text>
          <rect x="920" y="340" width="50" height="140" fill="none" stroke="var(--color-bone)" strokeWidth=".5" strokeDasharray="5,4" rx="3"/>
          <text x="945" y="415" textAnchor="middle" fontSize="7" fill="var(--color-muted)">DS wing</text>

          {/* Main Drape */}
          <line x1="80" y1="480" x2="920" y2="480" stroke="var(--color-ink)" strokeWidth="2"/>
          <text x="95" y="475" fontSize="8" fill="var(--color-muted)">MAIN DRAPE</text>

          {/* Stage area labels */}
          {[
            { l: "USR", x: 200, y: 210 }, { l: "USC", x: 500, y: 190 }, { l: "USL", x: 800, y: 210 },
            { l: "CSR", x: 200, y: 310 }, { l: "CS", x: 500, y: 310 }, { l: "CSL", x: 800, y: 310 },
            { l: "DSR", x: 200, y: 420 }, { l: "DSC", x: 500, y: 420 }, { l: "DSL", x: 800, y: 420 },
          ].map((a) => (
            <text key={a.l} x={a.x} y={a.y} textAnchor="middle" fontSize="10" fill="var(--color-bone)" fontWeight="500">{a.l}</text>
          ))}

          {/* Audience */}
          <rect x="80" y="500" width="840" height="240" rx="6" fill="var(--color-paper)" stroke="var(--color-bone)" strokeWidth=".5"/>
          <text x="500" y="520" textAnchor="middle" fontSize="9" fill="var(--color-muted)" letterSpacing="1">AUDIENCE</text>

          {/* Orchestra sections */}
          <rect x="100" y="530" width="320" height="90" rx="4" fill="none" stroke="var(--color-bone)" strokeWidth=".5"/>
          <text x="260" y="580" textAnchor="middle" fontSize="9" fill="var(--color-muted)">ORCH (HL side)</text>
          <rect x="580" y="530" width="320" height="90" rx="4" fill="none" stroke="var(--color-bone)" strokeWidth=".5"/>
          <text x="740" y="580" textAnchor="middle" fontSize="9" fill="var(--color-muted)">ORCH (HR side)</text>

          {/* 4' walkway */}
          <rect x="100" y="620" width="800" height="25" rx="2" fill="var(--color-bone)" fillOpacity=".15" stroke="var(--color-bone)" strokeWidth=".8"/>
          <text x="500" y="636" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--color-ash)">4&apos; walkway</text>

          {/* Mezzanine */}
          <rect x="100" y="650" width="800" height="70" rx="4" fill="none" stroke="var(--color-bone)" strokeWidth=".5"/>
          <text x="500" y="690" textAnchor="middle" fontSize="9" fill="var(--color-muted)">MEZZANINE</text>

          {/* HL / HR aisles */}
          <line x1="260" y1="620" x2="260" y2="730" stroke="var(--color-bone)" strokeWidth="1" strokeDasharray="5,4"/>
          <text x="250" y="710" textAnchor="end" fontSize="8" fill="var(--color-muted)">HL</text>
          <line x1="740" y1="620" x2="740" y2="730" stroke="var(--color-bone)" strokeWidth="1" strokeDasharray="5,4"/>
          <text x="750" y="710" fontSize="8" fill="var(--color-muted)">HR</text>

          <text x="500" y="15" textAnchor="middle" fontSize="9" fill="var(--color-muted)" letterSpacing="1">UPSTAGE</text>
          <text x="20" y="300" textAnchor="middle" fontSize="9" fill="var(--color-muted)" letterSpacing="1" transform="rotate(-90,20,300)">STAGE RIGHT (HL)</text>
          <text x="980" y="300" textAnchor="middle" fontSize="9" fill="var(--color-muted)" letterSpacing="1" transform="rotate(90,980,300)">STAGE LEFT (HR)</text>
        </svg>

        {/* On-stage tokens — positioned over the SVG */}
        {characters.map((char) => {
          const pos = getCharPos(char);
          if (!pos.on_stage && dragging !== char) return null;
          const isFiltered = mode === "actor" && actorFilter && actorFilter !== char;
          const isDraggingThis = dragging === char;
          return (
            <div key={char}
              onPointerDown={(e) => handlePointerDown(char, e)}
              className={`absolute select-none ${mode === "edit" && canManage ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
              style={{
                left: `${pos.x * 100}%`, top: `${pos.y * 100}%`,
                transform: "translate(-50%, -50%)",
                transition: isDraggingThis ? "none" : "left 0.5s ease, top 0.5s ease, opacity 0.3s",
                opacity: isFiltered ? 0.15 : 1,
                zIndex: isDraggingThis ? 50 : 10,
              }}>
              <div className="relative group">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-sm"
                  style={{ background: getColor(char), fontSize: "10px", fontWeight: 600, boxShadow: isDraggingThis ? "0 0 0 3px rgba(196,82,45,0.5)" : undefined }}>
                  {initials(char)}
                </div>
                <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-body-xs bg-card border border-bone rounded px-2 py-0.5 shadow-sm z-30 pointer-events-none">
                  {char}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Off-stage tray */}
      {(() => {
        const offStage = characters.filter((c) => {
          const pos = getCharPos(c);
          return !pos.on_stage && dragging !== c;
        });
        if (offStage.length === 0 && sceneMoments.length > 0) return null;
        return (
          <div className="px-4 py-3 border-t border-bone bg-card/80">
            <p className="text-body-xs text-muted mb-2">
              {sceneMoments.length === 0
                ? "Create a moment to start placing characters"
                : `Off stage · ${offStage.length} character${offStage.length === 1 ? "" : "s"} — drag onto the map`}
            </p>
            <div className="flex flex-wrap gap-2">
              {(sceneMoments.length === 0 ? characters : offStage).map((char) => (
                <div key={char}
                  onPointerDown={(e) => handlePointerDown(char, e)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border border-bone bg-card select-none transition-colors ${
                    mode === "edit" && canManage && sceneMoments.length > 0 ? "cursor-grab active:cursor-grabbing hover:border-ash" : ""
                  }`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{ background: getColor(char), fontSize: "8px", fontWeight: 600 }}>
                    {initials(char)}
                  </div>
                  <span className="text-body-xs text-ink whitespace-nowrap">{char}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Draft note editor */}
      {draftNote && (
        <div className="px-4 py-3 border-t border-bone bg-card">
          <p className="text-body-xs text-muted mb-1">Blocking note for <span className="font-medium text-ink">{draftNote.character}</span></p>
          <div className="flex gap-2">
            <input type="text" value={draftNote.text} onChange={(e) => setDraftNote({ ...draftNote, text: e.target.value })}
              className={`${inputClass} flex-1`} />
            <button onClick={confirmDraftNote} disabled={saving}
              className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50 shrink-0">
              {saving ? "..." : "Confirm"}
            </button>
            <button onClick={dismissDraftNote} className="text-body-sm text-muted hover:text-ink shrink-0">Skip</button>
          </div>
          {sceneLines.length > 0 && (
            <select value={draftNote.lineId || ""} onChange={(e) => setDraftNote({ ...draftNote, lineId: e.target.value || undefined })}
              className="mt-2 text-body-xs bg-transparent border border-bone rounded px-2 py-1 text-ash w-full focus:outline-none">
              <option value="">Attach to line... (optional)</option>
              {sceneLines.slice(0, 40).map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.lineNumber} {l.character ? `${l.character}: ` : ""}{l.content.slice(0, 60)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Moment timeline */}
      <div className="px-4 py-3 border-t border-bone bg-card">
        <div className="flex items-center gap-2">
          {mode === "playback" && (
            <button onClick={() => setPlaying(!playing)}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-bone hover:bg-bone/20 transition-colors shrink-0">
              {playing ? "⏸" : "▶"}
            </button>
          )}
          <button onClick={() => setCurrentMomentIdx(Math.max(0, currentMomentIdx - 1))} disabled={currentMomentIdx === 0}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-bone hover:bg-bone/20 disabled:opacity-30 shrink-0">←</button>

          <div className="flex-1 text-center min-w-0">
            {currentMoment ? (
              <>
                <p className="text-body-sm font-medium text-ink truncate">{currentMoment.label}</p>
                <p className="text-body-xs text-muted">{currentMomentIdx + 1} / {sceneMoments.length}</p>
              </>
            ) : (
              <p className="text-body-sm text-muted">{sceneMoments.length === 0 ? "No moments yet" : "—"}</p>
            )}
          </div>

          <button onClick={() => setCurrentMomentIdx(Math.min(sceneMoments.length - 1, currentMomentIdx + 1))} disabled={currentMomentIdx >= sceneMoments.length - 1}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-bone hover:bg-bone/20 disabled:opacity-30 shrink-0">→</button>

          {mode === "edit" && canManage && (
            <>
              <button onClick={() => setShowAddMoment(true)} className="w-8 h-8 flex items-center justify-center rounded-full border border-bone hover:bg-bone/20 text-body-sm shrink-0">+</button>
              {currentMoment && (
                <button onClick={handleDeleteMoment} className="w-8 h-8 flex items-center justify-center rounded-full border border-bone hover:bg-conflict/10 text-body-sm text-muted hover:text-conflict shrink-0">×</button>
              )}
            </>
          )}
        </div>

        {/* Moment dots */}
        {sceneMoments.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {sceneMoments.map((_, i) => (
              <button key={i} onClick={() => setCurrentMomentIdx(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === currentMomentIdx ? "bg-brick" : "bg-bone hover:bg-ash"}`} />
            ))}
          </div>
        )}

        {/* New moment form */}
        {showAddMoment && (
          <div className="mt-3 flex gap-2 items-end">
            <div className="flex-1">
              <input type="text" value={newMomentLabel} onChange={(e) => setNewMomentLabel(e.target.value)}
                placeholder="Moment name..." className={inputClass} autoFocus />
            </div>
            <select value={newMomentLineId} onChange={(e) => setNewMomentLineId(e.target.value)}
              className="text-body-xs bg-transparent border border-bone rounded px-2 py-2 text-ash max-w-[200px] focus:outline-none">
              <option value="">No line (free)</option>
              {sceneLines.slice(0, 40).map((l) => (
                <option key={l.id} value={l.id}>#{l.lineNumber} {l.character || ""}</option>
              ))}
            </select>
            <button onClick={handleCreateMoment} disabled={saving || !newMomentLabel.trim()}
              className="px-3 py-2 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 disabled:opacity-50 shrink-0">Add</button>
            <button onClick={() => { setShowAddMoment(false); setNewMomentLabel(""); }} className="text-body-xs text-muted">×</button>
          </div>
        )}
      </div>

      {/* Actor filter (actor view mode only) */}
      {mode === "actor" && (
        <div className="px-4 py-2 border-t border-bone/50 bg-card/50 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-body-xs text-muted shrink-0">Track:</span>
            {characters.map((c) => (
              <button key={c} onClick={() => setActorFilter(actorFilter === c ? null : c)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-body-xs transition-colors ${
                  actorFilter === c ? "bg-ink text-paper" : "text-ash hover:text-ink"
                }`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: getColor(c) }} />
                {c.length > 12 ? initials(c) : c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
