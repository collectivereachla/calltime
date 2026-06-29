"use client";

// Lead-only company availability calendar — now a second callboard: click any
// day to see who's out and create + tag an event right there.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createScheduleEvent } from "./actions";

type Conflict = {
  person_id: string; person_name: string; start_date: string; end_date: string | null;
  all_day: boolean; start_time: string | null; end_time: string | null;
  conflict_type: string | null; description: string | null; recurring_rule: string | null;
};
type Member = { id: string; name: string; department: string };

const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const EVENT_TYPES = ["rehearsal", "tech", "performance", "meeting", "fitting", "photo_call", "load_in", "strike", "other"];

function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseISO(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function fmtTime(t: string | null) {
  if (!t) return ""; const [h, m] = t.split(":"); const hour = parseInt(h);
  const period = hour >= 12 ? "PM" : "AM"; const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
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

type DayHit = { name: string; type: string | null; description: string | null; window: string | null };
type EventInfo = { title: string; date: string; start_time: string | null; end_time: string | null; event_type: string | null; kind: string | null; location: string | null; mandatory: boolean; published: boolean };

export function ProductionAvailability({
  conflicts, responseConflicts, mandatoryDates, eventDates, events = [],
  productionCreatedAt, firstRehearsal, closingDate, rosterCount,
  productionId, members,
}: {
  conflicts: Conflict[];
  responseConflicts: { date: string; name: string; reason: string | null }[];
  mandatoryDates: string[]; eventDates: string[]; events?: EventInfo[];
  productionCreatedAt: string | null; firstRehearsal: string | null; closingDate: string | null;
  rosterCount: number; productionId: string; members: Member[];
}) {
  const router = useRouter();
  const [earlier, setEarlier] = useState(0);
  const [later, setLater] = useState(0);

  // Day panel + new-event form
  const [sel, setSel] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [etype, setEtype] = useState("rehearsal");
  const [kind, setKind] = useState("rehearsal");
  const [stime, setStime] = useState("");
  const [etime, setEtime] = useState("");
  const [loc, setLoc] = useState("");
  const [callAll, setCallAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const baseStart = productionCreatedAt ? parseISO(productionCreatedAt.slice(0, 10)) : firstRehearsal ? parseISO(firstRehearsal) : new Date(today);
  const baseEnd = closingDate ? addDays(parseISO(closingDate), 14) : firstRehearsal ? addDays(parseISO(firstRehearsal), 120) : addDays(today, 90);
  const start = addMonths(baseStart, -earlier);
  let end = addMonths(baseEnd, later);
  if (end < start) end = addDays(start, 28);

  const mandatory = new Set(mandatoryDates);
  const scheduled = new Set(eventDates);
  const eventsByDay = new Map<string, EventInfo[]>();
  for (const ev of events) { if (!eventsByDay.has(ev.date)) eventsByDay.set(ev.date, []); eventsByDay.get(ev.date)!.push(ev); }
  for (const list of eventsByDay.values()) list.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const byDay = new Map<string, DayHit[]>();
  const add = (ds: string, hit: DayHit) => { if (!byDay.has(ds)) byDay.set(ds, []); byDay.get(ds)!.push(hit); };
  for (const c of conflicts) {
    const win = c.all_day ? null : c.start_time ? `${fmtTime(c.start_time)}${c.end_time ? `–${fmtTime(c.end_time)}` : ""}` : null;
    const hit: DayHit = { name: c.person_name, type: c.conflict_type, description: c.description, window: win };
    if (c.recurring_rule) {
      const day = (c.recurring_rule.match(/BYDAY=([A-Z]{2})/) || [])[1];
      const untilM = (c.recurring_rule.match(/UNTIL=(\d{8})/) || [])[1];
      const dowIdx = DOW_CODE.indexOf(day || "");
      const stop = untilM ? new Date(+untilM.slice(0, 4), +untilM.slice(4, 6) - 1, +untilM.slice(6, 8)) : end;
      const d = new Date(start);
      while (d <= end && d <= stop) { if (dowIdx < 0 || d.getDay() === dowIdx) add(iso(d), hit); d.setDate(d.getDate() + 1); }
    } else {
      const s = parseISO(c.start_date); const e = c.end_date ? parseISO(c.end_date) : new Date(s);
      const d = new Date(s < start ? start : s);
      while (d <= e && d <= end) { add(iso(d), hit); d.setDate(d.getDate() + 1); }
    }
  }
  for (const r of responseConflicts) {
    const existing = byDay.get(r.date);
    if (existing && existing.some((h) => h.name === r.name)) continue;
    add(r.date, { name: r.name, type: "flagged a call", description: r.reason, window: null });
  }

  const inWindow = (d: Date) => d >= start && d <= end;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const datesWithHits = Array.from(byDay.keys()).filter((d) => d >= iso(start) && d <= iso(end)).sort();

  function openDay(ds: string) {
    setSel(ds); setTitle(""); setEtype("rehearsal"); setKind("rehearsal");
    setStime(""); setEtime(""); setLoc(""); setCallAll(false); setPicked(new Set()); setErr(null);
  }
  function togglePerson(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function createEvent() {
    if (!sel) return;
    if (!title.trim()) { setErr("Give the event a title."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("title", title.trim());
    fd.set("event_date", sel);
    fd.set("event_type", etype);
    fd.set("kind", kind);
    if (stime) fd.set("start_time", stime);
    if (etime) fd.set("end_time", etime);
    if (loc.trim()) fd.set("location", loc.trim());
    if (callAll) fd.set("call_everyone", "on");
    else picked.forEach((id) => fd.append("person_ids", id));
    const r = await createScheduleEvent(fd);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setSel(null);
    router.refresh();
  }

  const inputCls = "w-full px-3 py-2 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none";

  return (
    <div>
      <p className="text-body-sm text-ash mb-3">
        Click a day to see who&rsquo;s out and post a call. Mandatory calls are outlined; the company can&rsquo;t conflict those days.
      </p>

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setEarlier((e) => Math.min(e + 1, 18))} className="text-body-xs font-medium px-3 py-1.5 rounded-card border border-bone text-ash hover:text-ink hover:border-ash transition-colors">← Show earlier</button>
        <span className="text-body-xs text-muted">{start.toLocaleDateString("en-US", { month: "short", year: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
        <button onClick={() => setLater((l) => Math.min(l + 1, 18))} className="text-body-xs font-medium px-3 py-1.5 rounded-card border border-bone text-ash hover:text-ink hover:border-ash transition-colors">Show later →</button>
      </div>

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
                    const hits = byDay.get(ds)?.length || 0;
                    const isMand = mandatory.has(ds);
                    const hasEvent = scheduled.has(ds);
                    if (!within) return <div key={ds} className="aspect-square border border-transparent text-bone flex items-center justify-center text-body-sm">{d.getDate()}</div>;
                    return (
                      <button key={ds} type="button" onClick={() => openDay(ds)}
                        className={`relative aspect-square rounded-card text-body-sm flex flex-col items-center justify-center border transition-colors hover:ring-1 hover:ring-ash ${
                          isMand ? "border-ink/60 bg-ink/5 text-ink"
                          : hits > 0 ? "bg-brick/10 border-brick/30 text-ink"
                          : hasEvent ? "bg-tentative/5 border-tentative/40 text-ink"
                          : "bg-card border-bone text-ash"
                        }`}>
                        {hasEvent && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-tentative" />}
                        <span className={isMand ? "font-semibold" : ""}>{d.getDate()}</span>
                        {hits > 0 && <span className="text-[10px] leading-none text-brick font-medium">{hits} out</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4 text-body-xs text-ash">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brick/10 border border-brick/30 inline-block" /> Someone&rsquo;s out</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-tentative/5 border border-tentative/40 inline-block" /> Has a call/event</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ink/5 border border-ink/60 inline-block" /> Mandatory call</span>
      </div>

      {/* Day panel — conflicts + post a call */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center overflow-y-auto p-4" onClick={() => setSel(null)}>
          <div className="bg-paper border border-bone rounded-card w-full max-w-lg my-8 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-display-sm text-ink">{parseISO(sel).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3>
              <button onClick={() => setSel(null)} className="text-muted hover:text-ink text-lg leading-none">&times;</button>
            </div>

            {mandatory.has(sel) && <p className="text-body-xs font-medium text-ink bg-ink/10 rounded-card px-3 py-1.5 mb-3">Mandatory call — the company can&rsquo;t conflict this day.</p>}

            {/* On the calendar this day */}
            {(eventsByDay.get(sel) || []).length > 0 && (
              <div className="mb-4">
                <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">On the calendar</p>
                <div className="space-y-1">
                  {eventsByDay.get(sel)!.map((ev, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-body-sm">
                      <span className="font-mono text-data-sm text-ink whitespace-nowrap">{ev.start_time ? fmtTime(ev.start_time) : "TBD"}{ev.end_time ? `\u2013${fmtTime(ev.end_time)}` : ""}</span>
                      <span className="text-ink font-medium">{ev.title}</span>
                      {ev.location && <span className="text-muted">&middot; {ev.location}</span>}
                      {!ev.published && <span className="text-body-xs text-tentative">draft</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Who's out */}
            <div className="mb-4">
              <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">Who&rsquo;s out</p>
              {(byDay.get(sel) || []).length === 0 ? (
                <p className="text-body-sm text-muted">Everyone&rsquo;s clear this day.</p>
              ) : (
                <div className="space-y-0.5">
                  {byDay.get(sel)!.map((h, i) => (
                    <p key={i} className="text-body-sm text-ash"><span className="font-medium text-ink">{h.name}</span>{h.window && <span className="text-muted"> · {h.window}</span>}{h.type && <span className="text-muted"> · {h.type.replace("_", " ")}</span>}{h.description && <span className="text-muted"> — {h.description}</span>}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Post a call */}
            <div className="border-t border-bone pt-4">
              <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Post a call</p>
              {err && <p className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2 mb-2">{err}</p>}
              <div className="space-y-3">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title (e.g. Act I Music Rehearsal)" className={inputCls} />
                <div className="grid grid-cols-2 gap-3">
                  <select value={etype} onChange={(e) => setEtype(e.target.value)} className={inputCls}>
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                    <option value="rehearsal">Rehearsal — whole company</option>
                    <option value="production">Production — tagged only</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input type="time" value={stime} onChange={(e) => setStime(e.target.value)} className={`${inputCls} font-mono text-data-sm`} />
                  <input type="time" value={etime} onChange={(e) => setEtime(e.target.value)} className={`${inputCls} font-mono text-data-sm`} />
                  <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location" className={inputCls} />
                </div>
                <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={callAll} onChange={(e) => setCallAll(e.target.checked)} className="rounded border-bone text-brick focus:ring-brick" /> Call everyone
                </label>
                {!callAll && (
                  <div className="max-h-40 overflow-y-auto border border-bone rounded-card p-2 space-y-1">
                    {members.length === 0 && <p className="text-body-xs text-muted">No company members to tag.</p>}
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-body-sm text-ink cursor-pointer py-0.5">
                        <input type="checkbox" checked={picked.has(m.id)} onChange={() => togglePerson(m.id)} className="rounded border-bone text-brick focus:ring-brick" />
                        {m.name} <span className="text-body-xs text-muted">{m.department}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={createEvent} disabled={busy} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">{busy ? "Posting…" : "Post call (draft)"}</button>
                  <span className="text-body-xs text-muted">Saved as a draft. Publish the week on the Callboard to notify.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-body-xs text-muted uppercase tracking-wider mb-3">Conflicts by day</h3>
        {datesWithHits.length === 0 ? (
          <p className="text-body-sm text-muted">No declared conflicts in this window. As the company fills in their conflict calendars, they&rsquo;ll show here.</p>
        ) : (
          <div className="space-y-3">
            {datesWithHits.map((ds) => {
              const hits = byDay.get(ds)!;
              const isMand = mandatory.has(ds);
              return (
                <button key={ds} onClick={() => openDay(ds)} className="w-full text-left bg-card border border-bone rounded-card px-4 py-3 hover:border-ash transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-data-sm text-ink">{parseISO(ds).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                    {isMand && <span className="text-body-xs font-medium px-1.5 py-0.5 rounded bg-ink/10 text-ink">Mandatory</span>}
                    <span className="text-body-xs text-muted">{hits.length} out</span>
                  </div>
                  <div className="space-y-0.5">
                    {hits.map((h, i) => (
                      <p key={i} className="text-body-sm text-ash"><span className="font-medium text-ink">{h.name}</span>{h.window && <span className="text-muted"> · {h.window}</span>}{h.type && <span className="text-muted"> · {h.type.replace("_", " ")}</span>}{h.description && <span className="text-muted"> — {h.description}</span>}</p>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
