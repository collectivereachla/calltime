"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markDayUnavailable, deleteConflict, submitConflict } from "@/app/(app)/callboard/conflict-actions";

type Conflict = {
  id: string;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  conflict_type: string | null;
  description: string | null;
  recurring_rule: string | null;
};

const CONFLICT_TYPES = [
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "medical", label: "Medical" },
  { value: "religious", label: "Religious" },
  { value: "family", label: "Family" },
  { value: "other_production", label: "Other production" },
  { value: "other", label: "Other" },
];
const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDay(s: string) {
  return parseISO(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${period}`;
}
function buildMonths(start: Date, end: Date) {
  const months: { label: string; weeks: (Date | null)[][] }[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ label: cur.toLocaleDateString("en-US", { month: "long", year: "numeric" }), weeks });
    cur = new Date(y, m + 1, 1);
  }
  return months;
}

function recurDesc(rule: string | null): string | null {
  if (!rule) return null;
  const day = (rule.match(/BYDAY=([A-Z]{2})/) || [])[1];
  const until = (rule.match(/UNTIL=(\d{8})/) || [])[1];
  const dayName = { SU: "Sundays", MO: "Mondays", TU: "Tuesdays", WE: "Wednesdays", TH: "Thursdays", FR: "Fridays", SA: "Saturdays" }[day || ""] || "weekly";
  const u = until ? ` until ${until.slice(4, 6)}/${until.slice(6, 8)}/${until.slice(0, 4)}` : "";
  return `Repeats ${dayName}${u}`;
}

export function AvailabilityCalendar({ conflicts, inferred = [], windowStart, windowEnd, prodTitle }: {
  conflicts: Conflict[];
  inferred?: { date: string; title: string; status: string; reason: string | null }[];
  windowStart: string | null;
  windowEnd: string | null;
  prodTitle: string | null;
}) {
  const router = useRouter();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let start = windowStart ? parseISO(windowStart) : new Date(today);
  if (start < today) start = new Date(today);
  let end = windowEnd ? parseISO(windowEnd) : null;
  if (!end || end < start) { end = new Date(start); end.setDate(end.getDate() + 56); }
  const maxEnd = new Date(start); maxEnd.setDate(maxEnd.getDate() + 120);
  if (end > maxEnd) end = maxEnd;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inf, setInf] = useState(inferred);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [fStartT, setFStartT] = useState("");
  const [fEndT, setFEndT] = useState("");
  const [repeats, setRepeats] = useState(false);
  const [until, setUntil] = useState("");
  const [fType, setFType] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Single-day all-day conflicts are the quick-toggle layer on the grid.
  const singleAllDay: Record<string, string> = {};
  // Every date touched by any conflict (for visual marking), mapped to its id.
  const coveredId: Record<string, string> = {};
  for (const c of conflicts) {
    if (c.recurring_rule) {
      const day = (c.recurring_rule.match(/BYDAY=([A-Z]{2})/) || [])[1];
      const untilM = (c.recurring_rule.match(/UNTIL=(\d{8})/) || [])[1];
      const dowIdx = DOW_CODE.indexOf(day || "");
      const stop = untilM ? new Date(+untilM.slice(0, 4), +untilM.slice(4, 6) - 1, +untilM.slice(6, 8)) : end;
      const d = new Date(start);
      while (d <= end && d <= stop) {
        if (dowIdx < 0 || d.getDay() === dowIdx) coveredId[iso(d)] = c.id;
        d.setDate(d.getDate() + 1);
      }
    } else {
      const s = parseISO(c.start_date);
      const e = c.end_date ? parseISO(c.end_date) : new Date(s);
      const d = new Date(s);
      while (d <= e) { coveredId[iso(d)] = c.id; d.setDate(d.getDate() + 1); }
      if (c.all_day && (!c.end_date || c.end_date === c.start_date)) singleAllDay[c.start_date] = c.id;
    }
  }

  function openAdd(prefill?: string) {
    setEditId(null); setFStart(prefill || ""); setFEnd(""); setAllDay(true);
    setFStartT(""); setFEndT(""); setRepeats(false); setUntil(""); setFType(""); setFNote("");
    setError(null); setShowForm(true);
  }
  function openEdit(c: Conflict) {
    setEditId(c.id); setFStart(c.start_date); setFEnd(c.end_date || "");
    setAllDay(c.all_day); setFStartT(c.start_time || ""); setFEndT(c.end_time || "");
    setRepeats(!!c.recurring_rule);
    setUntil((() => { const u = (c.recurring_rule?.match(/UNTIL=(\d{8})/) || [])[1]; return u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : ""; })());
    setFType(c.conflict_type || ""); setFNote(c.description || "");
    setError(null); setShowForm(true);
  }

  async function confirmInferred(ds: string) {
    setError(null); setBusy(ds);
    const r = await markDayUnavailable(ds);
    setBusy(null);
    if (r?.error || !r?.id) { setError(r?.error || "Couldn't save."); return; }
    setInf((list) => list.filter((x) => x.date !== ds));
    router.refresh();
  }

  async function toggle(ds: string) {
    setError(null);
    // Day belongs to a range/recurring/partial conflict -> open it for editing.
    const owner = coveredId[ds];
    if (owner && !singleAllDay[ds]) {
      const c = conflicts.find((x) => x.id === owner);
      if (c) openEdit(c);
      return;
    }
    setBusy(ds);
    const existing = singleAllDay[ds];
    if (existing) {
      const r = await deleteConflict(existing);
      setBusy(null);
      if (r?.error) { setError(r.error); return; }
    } else {
      const r = await markDayUnavailable(ds);
      setBusy(null);
      if (r?.error) { setError(r.error); return; }
    }
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!fStart) { setError("Pick a start date."); return; }
    setError(null); setSaving(true);
    const fd = new FormData();
    fd.set("start_date", fStart);
    if (fEnd) fd.set("end_date", fEnd);
    fd.set("all_day", allDay ? "true" : "false");
    if (!allDay) { if (fStartT) fd.set("start_time", fStartT); if (fEndT) fd.set("end_time", fEndT); }
    if (fType) fd.set("conflict_type", fType);
    if (fNote) fd.set("description", fNote);
    if (editId) fd.set("conflict_id", editId);
    if (repeats) {
      const dow = DOW_CODE[parseISO(fStart).getDay()];
      const untilPart = until ? `;UNTIL=${until.replace(/-/g, "")}` : "";
      fd.set("recurring_rule", `FREQ=WEEKLY;BYDAY=${dow}${untilPart}`);
    }
    const r = await submitConflict(fd);
    setSaving(false);
    if (r?.error) { setError(r.error); return; }
    setShowForm(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const r = await deleteConflict(id);
    setBusy(null);
    if (r?.error) { setError(r.error); return; }
    if (editId === id) setShowForm(false);
    router.refresh();
  }

  // Calendar grid
  const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(end); gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  const weeks: Date[][] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  const inWindow = (d: Date) => d >= start && d <= end;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayStr = iso(today);

  const sorted = [...conflicts].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = sorted.filter((c) => (c.end_date || c.start_date) >= todayStr || c.recurring_rule);
  const past = sorted.filter((c) => !c.recurring_rule && (c.end_date || c.start_date) < todayStr);

  const inputClass = "w-full px-3 py-2 bg-card border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none";

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-display text-display-md text-ink">My conflicts</h1>
        {!showForm && (
          <button onClick={() => openAdd()} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors shrink-0">
            Add conflict
          </button>
        )}
      </div>
      <p className="text-body-md text-ash mb-6">
        Everything in one place: tap a day you can&rsquo;t make it, or add a date range, part of a day, or a repeating conflict
        {prodTitle ? <> for <span className="font-display italic">{prodTitle}</span></> : null}. Your stage manager and director see these when building the schedule.
      </p>
      {error && <p className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2 mb-3">{error}</p>}

      {/* Add / edit form */}
      {showForm && (
        <form onSubmit={save} className="bg-card border border-bone rounded-card p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-ink">{editId ? "Edit conflict" : "Add a conflict"}</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-body-xs text-muted hover:text-ink">Cancel</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Start date</label>
              <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">End date <span className="text-muted">(optional)</span></label>
              <input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="rounded border-bone text-brick focus:ring-brick" /> All day
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
              <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} className="rounded border-bone text-brick focus:ring-brick" /> Repeats weekly
            </label>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-body-xs text-ash mb-1">Start time</label>
                <input type="time" value={fStartT} onChange={(e) => setFStartT(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">End time</label>
                <input type="time" value={fEndT} onChange={(e) => setFEndT(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
          {repeats && (
            <div>
              <label className="block text-body-xs text-ash mb-1">Repeat until <span className="text-muted">(optional)</span></label>
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
              <p className="text-body-xs text-muted mt-1">Repeats weekly on the same weekday as the start date.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Type</label>
              <select value={fType} onChange={(e) => setFType(e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {CONFLICT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Note <span className="text-muted">(optional)</span></label>
              <input type="text" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="e.g. work, class, church" className={inputClass} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">
              {saving ? "Saving…" : editId ? "Save changes" : "Add conflict"}
            </button>
            {editId && (
              <button type="button" onClick={() => remove(editId)} disabled={busy === editId} className="text-body-xs text-muted hover:text-brick ml-1">
                {busy === editId ? "…" : "Remove this conflict"}
              </button>
            )}
          </div>
        </form>
      )}

      {/* Inferred from callboard */}
      {inf.length > 0 && (
        <div className="mb-6 bg-brick/5 border border-brick/20 rounded-card p-4">
          <p className="text-body-sm font-medium text-ink mb-1">From your callboard responses</p>
          <p className="text-body-xs text-ash mb-3">You flagged a conflict on these dates. Confirm them so your stage manager and the schedule know.</p>
          <div className="space-y-2">
            {inf.map((x) => (
              <div key={x.date} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-body-sm text-ink">{fmtDay(x.date)}</span>
                  <span className="text-body-xs text-ash"> · {x.title}{x.reason ? ` (${x.reason})` : ""}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => confirmInferred(x.date)} disabled={busy === x.date} className="px-3 py-1 bg-ink text-paper text-body-xs rounded-card hover:bg-ink/90 disabled:opacity-50">Can&rsquo;t make it</button>
                  <button type="button" onClick={() => setInf((l) => l.filter((y) => y.date !== x.date))} className="px-2 py-1 text-body-xs text-muted hover:text-ink">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="space-y-6">
        {buildMonths(start, end).map((mo) => (
          <div key={mo.label}>
            <div className="pb-2"><span className="font-display text-body-lg text-ink">{mo.label}</span></div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dow.map((d) => <div key={d} className="text-center text-body-xs font-medium text-muted py-1">{d}</div>)}
            </div>
            <div className="space-y-1">
              {mo.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((d, di) => {
                    if (!d) return <div key={di} className="aspect-square" />;
                    const ds = iso(d);
                    const within = inWindow(d);
                    const isSingle = !!singleAllDay[ds];
                    const isCovered = !!coveredId[ds];
                    const isToday = ds === todayStr;
                    return (
                      <button key={ds} type="button" disabled={!within || busy === ds} onClick={() => toggle(ds)}
                        title={within ? (isCovered ? "Conflict — tap to edit/clear" : "Tap if you can't make it") : ""}
                        className={`aspect-square rounded-card text-body-sm flex flex-col items-center justify-center border transition-colors ${
                          !within ? "border-transparent text-bone cursor-default"
                          : isSingle ? "bg-brick/15 border-brick/40 text-brick font-medium"
                          : isCovered ? "bg-brick/5 border-brick/30 text-brick"
                          : "bg-card border-bone text-ink hover:border-ash"
                        } ${isToday && within ? "ring-1 ring-ash" : ""} disabled:opacity-60`}>
                        <span>{d.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-5 text-body-xs text-ash">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brick/15 border border-brick/40 inline-block" /> Single day</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brick/5 border border-brick/30 inline-block" /> Range / repeating</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-card border border-bone inline-block" /> Available</span>
      </div>

      {/* List */}
      <div className="mt-8">
        <h2 className="text-body-xs text-muted uppercase tracking-wider mb-3">All conflicts</h2>
        {upcoming.length === 0 && <p className="text-body-sm text-muted">None yet. Add the dates you already know about — your SM will thank you.</p>}
        <div className="space-y-2">
          {upcoming.map((c) => (
            <button key={c.id} onClick={() => openEdit(c)} className="w-full text-left flex items-center justify-between bg-card border border-bone rounded-card px-4 py-3 hover:border-ash transition-colors">
              <div className="min-w-0">
                <p className="text-body-sm text-ink">
                  {fmtDay(c.start_date)}{c.end_date && c.end_date !== c.start_date ? ` — ${fmtDay(c.end_date)}` : ""}
                  {!c.all_day && c.start_time ? `, ${fmtTime(c.start_time)}${c.end_time ? `–${fmtTime(c.end_time)}` : ""}` : ""}
                </p>
                <p className="text-body-xs text-ash mt-0.5">
                  {c.recurring_rule && <span>{recurDesc(c.recurring_rule)}{(c.conflict_type || c.description) ? " · " : ""}</span>}
                  {c.conflict_type && <span className="capitalize">{c.conflict_type.replace("_", " ")}</span>}
                  {c.conflict_type && c.description && " — "}
                  {c.description}
                  {!c.recurring_rule && !c.conflict_type && !c.description && "All day"}
                </p>
              </div>
              <span className="text-body-xs text-muted shrink-0 ml-3">Edit</span>
            </button>
          ))}
        </div>
        {past.length > 0 && (
          <details className="mt-4">
            <summary className="text-body-xs text-muted cursor-pointer hover:text-ash">{past.length} past conflict{past.length === 1 ? "" : "s"}</summary>
            <div className="space-y-1 mt-2 opacity-60">
              {past.map((c) => <div key={c.id} className="text-body-xs text-ash px-4 py-1.5">{fmtDay(c.start_date)}{c.description ? ` — ${c.description}` : ""}</div>)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
