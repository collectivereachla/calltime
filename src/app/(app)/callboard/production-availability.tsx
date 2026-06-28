"use client";

// Lead-only company availability calendar. Spans the whole production by default
// (from when the show was created through 14 days after close) with controls to
// extend earlier or later. Shows, per day, who has declared a conflict (ranges +
// weekly-recurring expanded) and which days are mandatory calls.

import { useState, Fragment } from "react";

type Conflict = {
  person_id: string;
  person_name: string;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  conflict_type: string | null;
  description: string | null;
  recurring_rule: string | null;
};

const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${period}`;
}

type DayHit = { name: string; type: string | null; description: string | null; window: string | null };

export function ProductionAvailability({
  conflicts,
  mandatoryDates,
  productionCreatedAt,
  firstRehearsal,
  closingDate,
  rosterCount,
}: {
  conflicts: Conflict[];
  mandatoryDates: string[];
  productionCreatedAt: string | null;
  firstRehearsal: string | null;
  closingDate: string | null;
  rosterCount: number;
}) {
  const [earlier, setEarlier] = useState(0);
  const [later, setLater] = useState(0);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const baseStart = productionCreatedAt ? parseISO(productionCreatedAt.slice(0, 10))
    : firstRehearsal ? parseISO(firstRehearsal) : new Date(today);
  const baseEnd = closingDate ? addDays(parseISO(closingDate), 14)
    : firstRehearsal ? addDays(parseISO(firstRehearsal), 120) : addDays(today, 90);

  const start = addMonths(baseStart, -earlier);
  let end = addMonths(baseEnd, later);
  if (end < start) end = addDays(start, 28);

  const mandatory = new Set(mandatoryDates);

  // Expand conflicts into the days they touch within the window.
  const byDay = new Map<string, DayHit[]>();
  const add = (ds: string, hit: DayHit) => {
    if (!byDay.has(ds)) byDay.set(ds, []);
    byDay.get(ds)!.push(hit);
  };
  for (const c of conflicts) {
    const win = c.all_day ? null : c.start_time ? `${fmtTime(c.start_time)}${c.end_time ? `–${fmtTime(c.end_time)}` : ""}` : null;
    const hit: DayHit = { name: c.person_name, type: c.conflict_type, description: c.description, window: win };
    if (c.recurring_rule) {
      const day = (c.recurring_rule.match(/BYDAY=([A-Z]{2})/) || [])[1];
      const untilM = (c.recurring_rule.match(/UNTIL=(\d{8})/) || [])[1];
      const dowIdx = DOW_CODE.indexOf(day || "");
      const stop = untilM ? new Date(+untilM.slice(0, 4), +untilM.slice(4, 6) - 1, +untilM.slice(6, 8)) : end;
      const d = new Date(start);
      while (d <= end && d <= stop) {
        if (dowIdx < 0 || d.getDay() === dowIdx) add(iso(d), hit);
        d.setDate(d.getDate() + 1);
      }
    } else {
      const s = parseISO(c.start_date);
      const e = c.end_date ? parseISO(c.end_date) : new Date(s);
      const d = new Date(s < start ? start : s);
      while (d <= e && d <= end) { add(iso(d), hit); d.setDate(d.getDate() + 1); }
    }
  }

  // Grid weeks
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

  const datesWithHits = Array.from(byDay.keys()).filter((d) => d >= iso(start) && d <= iso(end)).sort();

  let lastLabel = "";

  return (
    <div>
      <p className="text-body-sm text-ash mb-3">
        Who has declared a conflict on each day, across {rosterCount} company member{rosterCount === 1 ? "" : "s"}. Mandatory calls are outlined &mdash; the company can&rsquo;t put a conflict on those days.
      </p>

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setEarlier((e) => Math.min(e + 1, 18))} className="text-body-xs font-medium px-3 py-1.5 rounded-card border border-bone text-ash hover:text-ink hover:border-ash transition-colors">← Show earlier</button>
        <span className="text-body-xs text-muted">
          {start.toLocaleDateString("en-US", { month: "short", year: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button onClick={() => setLater((l) => Math.min(l + 1, 18))} className="text-body-xs font-medium px-3 py-1.5 rounded-card border border-bone text-ash hover:text-ink hover:border-ash transition-colors">Show later →</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dow.map((d) => <div key={d} className="text-center text-body-xs text-muted py-1">{d}</div>)}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => {
          const rep = week[3];
          const label = `${rep.toLocaleDateString("en-US", { month: "long" })} ${rep.getFullYear()}`;
          const showLabel = label !== lastLabel;
          if (showLabel) lastLabel = label;
          return (
            <Fragment key={wi}>
              {showLabel && (
                <div className="pt-3 pb-1">
                  <span className="font-display text-body-md text-ink">{label}</span>
                </div>
              )}
              <div className="grid grid-cols-7 gap-1">
                {week.map((d) => {
                  const ds = iso(d);
                  const within = inWindow(d);
                  const hits = byDay.get(ds)?.length || 0;
                  const isMand = mandatory.has(ds);
                  return (
                    <div key={ds}
                      className={`aspect-square rounded-card text-body-sm flex flex-col items-center justify-center border ${
                        !within ? "border-transparent text-bone"
                        : isMand ? "border-ink/60 bg-ink/5 text-ink"
                        : hits > 0 ? "bg-brick/10 border-brick/30 text-ink"
                        : "bg-card border-bone text-ash"
                      }`}>
                      <span className={isMand ? "font-semibold" : ""}>{d.getDate()}</span>
                      {within && hits > 0 && <span className="text-[10px] leading-none text-brick font-medium">{hits} out</span>}
                      {within && isMand && hits === 0 && <span className="text-[9px] leading-none text-muted">must</span>}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4 text-body-xs text-ash">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brick/10 border border-brick/30 inline-block" /> Someone&rsquo;s out</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ink/5 border border-ink/60 inline-block" /> Mandatory call</span>
      </div>

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
                <div key={ds} className="bg-card border border-bone rounded-card px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-data-sm text-ink">{parseISO(ds).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                    {isMand && <span className="text-body-xs font-medium px-1.5 py-0.5 rounded bg-ink/10 text-ink">Mandatory</span>}
                    <span className="text-body-xs text-muted">{hits.length} out</span>
                  </div>
                  <div className="space-y-0.5">
                    {hits.map((h, i) => (
                      <p key={i} className="text-body-sm text-ash">
                        <span className="font-medium text-ink">{h.name}</span>
                        {h.window && <span className="text-muted"> · {h.window}</span>}
                        {h.type && <span className="text-muted"> · {h.type.replace("_", " ")}</span>}
                        {h.description && <span className="text-muted"> — {h.description}</span>}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
