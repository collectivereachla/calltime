"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { placeCallingCue, updateCallingCue, unplaceCallingCue, deleteCallingCue } from "./calling-script-actions";

export interface CallingLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
}

export interface CallingCue {
  id: string;
  department: string; // "lights" | "sound"
  cue_number: string;
  description: string | null;
  call_script_line_id: string | null;
  standby_script_line_id: string | null;
  status: string;
}

interface Props {
  productionId: string;
  canManage: boolean;
  scriptVersionLabel: string | null;
  lines: CallingLine[];
  cues: CallingCue[];
}

const DEPT_PREFIX: Record<string, string> = { lights: "LX", sound: "SQ" };
const STANDBY_OFFSET = 3; // lines before the GO where standby is called by default

function prefixOf(dept: string) {
  return DEPT_PREFIX[dept] || dept.toUpperCase();
}

function sceneKey(l: CallingLine) {
  return `${l.act}-${l.scene}`;
}

export function CallingScript({ productionId, canManage, scriptVersionLabel, lines, cues }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "lights" | "sound">("all");
  const [placing, setPlacing] = useState(false);
  const [addLineId, setAddLineId] = useState<string | null>(null);
  const [editCueId, setEditCueId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lineIndex = useMemo(() => {
    const m = new Map<string, number>();
    lines.forEach((l, i) => m.set(l.id, i));
    return m;
  }, [lines]);
  const lineIds = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);

  const visibleCues = useMemo(
    () => (filter === "all" ? cues : cues.filter((c) => c.department === filter)),
    [cues, filter]
  );

  const goByLine = useMemo(() => {
    const m = new Map<string, CallingCue[]>();
    for (const c of visibleCues) {
      if (c.call_script_line_id && lineIds.has(c.call_script_line_id)) {
        const arr = m.get(c.call_script_line_id) || [];
        arr.push(c);
        m.set(c.call_script_line_id, arr);
      }
    }
    return m;
  }, [visibleCues, lineIds]);

  const standbyByLine = useMemo(() => {
    const m = new Map<string, CallingCue[]>();
    for (const c of visibleCues) {
      if (c.standby_script_line_id && lineIds.has(c.standby_script_line_id)) {
        const arr = m.get(c.standby_script_line_id) || [];
        arr.push(c);
        m.set(c.standby_script_line_id, arr);
      }
    }
    return m;
  }, [visibleCues, lineIds]);

  // Cues placed against a line that isn't in this version (built on another version)
  const offVersion = useMemo(
    () => cues.filter((c) => c.call_script_line_id && !lineIds.has(c.call_script_line_id)),
    [cues, lineIds]
  );
  const unplaced = useMemo(() => cues.filter((c) => !c.call_script_line_id), [cues]);

  function nextCueNumber(dept: "lights" | "sound") {
    const pre = prefixOf(dept);
    const nums = cues
      .filter((c) => c.department === dept)
      .map((c) => parseFloat(c.cue_number.replace(/[^\d.]/g, "")))
      .filter((n) => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `${pre} ${next}`;
  }

  const totals = useMemo(
    () => ({
      lights: cues.filter((c) => c.department === "lights" && c.call_script_line_id).length,
      sound: cues.filter((c) => c.department === "sound" && c.call_script_line_id).length,
    }),
    [cues]
  );

  // ── render helpers ──────────────────────────────────────────────
  function lineBody(l: CallingLine) {
    const t = l.line_type;
    if (t === "character")
      return <p className="font-mono text-data-sm uppercase tracking-wider text-ink mt-3">{l.content}</p>;
    if (t === "stage_direction")
      return <p className="text-body-sm italic text-ash">{l.content}</p>;
    if (t === "song_title")
      return <p className="text-body-sm font-medium text-brick">{l.content}</p>;
    if (t === "song_direction")
      return <p className="text-body-xs uppercase tracking-wider text-muted">{l.content}</p>;
    if (t === "lyric") {
      return (
        <p className="text-body-sm text-ink/90 pl-3 border-l-2 border-brick/30">
          {l.character ? <span className="text-body-xs text-muted mr-2">{l.character}</span> : null}
          {l.content}
        </p>
      );
    }
    return <p className="text-body-sm text-ink">{l.content}</p>;
  }

  function deptChipClass(dept: string, kind: "go" | "standby") {
    const base = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-body-xs font-mono whitespace-nowrap";
    if (kind === "go") return `${base} bg-ink text-paper`;
    return `${base} border border-bone text-ash bg-card`;
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <div className="flex gap-1 bg-card border border-bone rounded-full p-0.5">
          {(["all", "lights", "sound"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${
                filter === f ? "bg-ink text-paper" : "text-ash hover:text-ink"
              }`}
            >
              {f === "all" ? "All" : prefixOf(f)}
            </button>
          ))}
        </div>
        <span className="font-mono text-body-xs text-muted">
          LX {totals.lights} · SQ {totals.sound}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => { setPlacing((p) => !p); setAddLineId(null); setEditCueId(null); }}
              className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${
                placing ? "bg-brick text-paper" : "border border-bone text-ash hover:text-ink"
              }`}
            >
              {placing ? "Done placing" : "Place cues"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-3 py-1 text-body-xs font-medium rounded-full border border-bone text-ash hover:text-ink transition-colors"
          >
            Print
          </button>
        </div>
      </div>

      <p className="text-body-xs text-muted mb-4">
        Calling against: <span className="text-ash font-medium">{scriptVersionLabel || "current script"}</span>
        {placing ? " · tap the + on any line to place a GO" : ""}
      </p>

      {/* Off-version warning */}
      {canManage && offVersion.length > 0 && (
        <div className="mb-4 bg-conflict/5 border border-conflict/30 rounded-card p-3 print:hidden">
          <p className="text-body-xs font-medium text-conflict mb-1">
            {offVersion.length} cue{offVersion.length === 1 ? "" : "s"} placed on a different script version
          </p>
          <p className="text-body-xs text-ash">
            These were called against an earlier version and don&apos;t line up with “{scriptVersionLabel}”. Re-place them on the current lines when you&apos;re ready.
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {offVersion.map((c) => (
              <span key={c.id} className={deptChipClass(c.department, "standby")}>
                {c.cue_number}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Unplaced cues from the Booth */}
      {canManage && unplaced.length > 0 && (
        <div className="mb-4 bg-card border border-bone rounded-card p-3 print:hidden">
          <p className="text-body-xs font-medium text-ash mb-1">Not yet placed in the calling script</p>
          <div className="flex flex-wrap gap-1">
            {unplaced.map((c) => (
              <span key={c.id} className={deptChipClass(c.department, "standby")} title={c.description || ""}>
                {c.cue_number}
              </span>
            ))}
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="bg-card border border-bone rounded-card p-6 text-center">
          <p className="text-body-md text-ash">No script loaded for this production yet.</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {lines.map((l, i) => {
            const prev = lines[i - 1];
            const newScene = !prev || sceneKey(prev) !== sceneKey(l);
            const standbys = standbyByLine.get(l.id) || [];
            const gos = goByLine.get(l.id) || [];
            return (
              <div key={l.id}>
                {newScene && (
                  <p className="font-display text-body-md text-ink mt-6 mb-2 pt-3 border-t border-bone">
                    Act {l.act}, Scene {l.scene}
                  </p>
                )}

                {/* Standby chips before the line */}
                {standbys.length > 0 && (
                  <div className="flex flex-wrap gap-1 my-1">
                    {standbys.map((c) => (
                      <span key={c.id} className={deptChipClass(c.department, "standby")}>
                        Standby {c.cue_number}
                      </span>
                    ))}
                  </div>
                )}

                <div className="group flex items-start gap-2">
                  <div className="flex-1 min-w-0">{lineBody(l)}</div>
                  {canManage && placing && (
                    <button
                      onClick={() => { setAddLineId(addLineId === l.id ? null : l.id); setEditCueId(null); }}
                      className="shrink-0 mt-1 w-5 h-5 flex items-center justify-center rounded-full border border-bone text-muted hover:text-brick hover:border-brick transition-colors text-body-xs print:hidden"
                      title="Place a cue here"
                    >
                      +
                    </button>
                  )}
                </div>

                {/* GO chips after the line */}
                {gos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 my-1">
                    {gos.map((c) => (
                      <button
                        key={c.id}
                        disabled={!canManage}
                        onClick={() => { setEditCueId(editCueId === c.id ? null : c.id); setAddLineId(null); }}
                        className={`${deptChipClass(c.department, "go")} ${canManage ? "cursor-pointer" : "cursor-default"}`}
                        title={c.description || ""}
                      >
                        {c.cue_number} GO
                      </button>
                    ))}
                    {gos.some((c) => c.description) && (
                      <span className="text-body-xs text-muted truncate">
                        {gos.filter((c) => c.description).map((c) => `${c.cue_number}: ${c.description}`).join(" · ")}
                      </span>
                    )}
                  </div>
                )}

                {/* Add form */}
                {canManage && addLineId === l.id && (
                  <AddCueForm
                    busy={busy}
                    nextNumber={nextCueNumber}
                    onCancel={() => setAddLineId(null)}
                    onSubmit={async (dept, num, desc, withStandby) => {
                      setBusy(true);
                      const standbyId = withStandby ? lines[Math.max(0, i - STANDBY_OFFSET)].id : null;
                      await placeCallingCue({
                        production_id: productionId,
                        department: dept,
                        cue_number: num,
                        description: desc || null,
                        call_script_line_id: l.id,
                        standby_script_line_id: standbyId,
                      });
                      setBusy(false);
                      setAddLineId(null);
                      router.refresh();
                    }}
                  />
                )}

                {/* Edit form */}
                {canManage && gos.some((c) => c.id === editCueId) && (
                  <EditCueForm
                    busy={busy}
                    cue={gos.find((c) => c.id === editCueId)!}
                    onCancel={() => setEditCueId(null)}
                    onSave={async (desc) => {
                      setBusy(true);
                      await updateCallingCue({ id: editCueId!, description: desc || null });
                      setBusy(false);
                      setEditCueId(null);
                      router.refresh();
                    }}
                    onUnplace={async () => {
                      setBusy(true);
                      await unplaceCallingCue(editCueId!);
                      setBusy(false);
                      setEditCueId(null);
                      router.refresh();
                    }}
                    onDelete={async () => {
                      setBusy(true);
                      await deleteCallingCue(editCueId!);
                      setBusy(false);
                      setEditCueId(null);
                      router.refresh();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const formInput =
  "w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

function AddCueForm({
  busy,
  nextNumber,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  nextNumber: (d: "lights" | "sound") => string;
  onCancel: () => void;
  onSubmit: (dept: "lights" | "sound", num: string, desc: string, withStandby: boolean) => void;
}) {
  const [dept, setDept] = useState<"lights" | "sound">("lights");
  const [num, setNum] = useState(nextNumber("lights"));
  const [desc, setDesc] = useState("");
  const [withStandby, setWithStandby] = useState(true);

  function changeDept(d: "lights" | "sound") {
    setDept(d);
    setNum(nextNumber(d));
  }

  return (
    <div className="my-2 bg-card border border-brick/40 rounded-card p-3 space-y-2 print:hidden">
      <div className="flex gap-1">
        {(["lights", "sound"] as const).map((d) => (
          <button
            key={d}
            onClick={() => changeDept(d)}
            className={`px-3 py-1 text-body-xs font-mono rounded-full transition-colors ${
              dept === d ? "bg-ink text-paper" : "border border-bone text-ash hover:text-ink"
            }`}
          >
            {prefixOf(d)}
          </button>
        ))}
        <input
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="w-24 px-2 py-1 bg-paper border border-bone rounded-card text-body-sm font-mono text-ink focus:border-brick focus:outline-none"
        />
      </div>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="What happens (e.g. fade to warm wash)"
        className={formInput}
      />
      <label className="flex items-center gap-2 text-body-xs text-ash">
        <input type="checkbox" checked={withStandby} onChange={(e) => setWithStandby(e.target.checked)}
          className="rounded border-bone text-brick focus:ring-brick" />
        Add standby {STANDBY_OFFSET} lines earlier
      </label>
      <div className="flex gap-2">
        <button
          disabled={busy || !num.trim()}
          onClick={() => onSubmit(dept, num.trim(), desc.trim(), withStandby)}
          className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          Place GO
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditCueForm({
  busy,
  cue,
  onCancel,
  onSave,
  onUnplace,
  onDelete,
}: {
  busy: boolean;
  cue: CallingCue;
  onCancel: () => void;
  onSave: (desc: string) => void;
  onUnplace: () => void;
  onDelete: () => void;
}) {
  const [desc, setDesc] = useState(cue.description || "");
  return (
    <div className="my-2 bg-card border border-bone rounded-card p-3 space-y-2 print:hidden">
      <p className="font-mono text-body-xs text-ink">{cue.cue_number}</p>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="What happens"
        className={formInput}
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => onSave(desc.trim())}
          className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={onUnplace}
          className="px-3 py-1.5 text-body-xs text-ash hover:text-brick transition-colors ml-auto"
        >
          Unplace
        </button>
        <button
          disabled={busy}
          onClick={onDelete}
          className="px-3 py-1.5 text-body-xs text-conflict hover:underline transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
