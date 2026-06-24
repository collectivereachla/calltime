"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markDayUnavailable, deleteConflict } from "@/app/(app)/callboard/conflict-actions";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function AvailabilityCalendar({ marked, windowStart, windowEnd, prodTitle }: {
  marked: Record<string, string>;
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

  const [map, setMap] = useState<Record<string, string>>({ ...marked });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(ds: string) {
    setError(null);
    setBusy(ds);
    const existing = map[ds];
    if (existing) {
      const prev = map;
      const next = { ...map }; delete next[ds]; setMap(next);
      const r = await deleteConflict(existing);
      setBusy(null);
      if (r?.error) { setMap(prev); setError(r.error); return; }
    } else {
      const r = await markDayUnavailable(ds);
      setBusy(null);
      if (r?.error || !r?.id) { setError(r?.error || "Couldn't save."); return; }
      setMap((m) => ({ ...m, [ds]: r.id as string }));
    }
    router.refresh();
  }

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

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-md text-ink mb-1">My availability</h1>
      <p className="text-body-md text-ash mb-6">
        Tap the days you <span className="font-medium">can&rsquo;t</span> make it
        {prodTitle ? <> for <span className="font-display italic">{prodTitle}</span></> : null}.
        Your stage manager and director see these when building the schedule.
      </p>
      {error && <p className="text-body-sm text-brick mb-3">{error}</p>}

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dow.map((d) => <div key={d} className="text-center text-body-xs text-muted py-1">{d}</div>)}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const ds = iso(d);
              const within = inWindow(d);
              const unavailable = !!map[ds];
              const isToday = ds === todayStr;
              return (
                <button
                  key={ds}
                  type="button"
                  disabled={!within || busy === ds}
                  onClick={() => toggle(ds)}
                  title={within ? (unavailable ? "Marked unavailable — tap to clear" : "Tap if you can't make it") : ""}
                  className={`aspect-square rounded-card text-body-sm flex flex-col items-center justify-center border transition-colors ${
                    !within
                      ? "border-transparent text-bone cursor-default"
                      : unavailable
                        ? "bg-brick/15 border-brick/40 text-brick font-medium"
                        : "bg-card border-bone text-ink hover:border-ash"
                  } ${isToday && within ? "ring-1 ring-ash" : ""} disabled:opacity-60`}
                >
                  <span>{d.getDate()}</span>
                  {within && d.getDate() === 1 && (
                    <span className="text-[9px] text-muted leading-none">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-5 text-body-xs text-ash">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brick/15 border border-brick/40 inline-block" /> Can&rsquo;t make it</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-card border border-bone inline-block" /> Available</span>
      </div>
      <p className="text-body-xs text-muted mt-4">
        Need to mark part of a day, or a recurring conflict? Use <a href="/settings" className="text-brick hover:underline">Settings &rsaquo; Conflicts</a>.
      </p>
    </div>
  );
}
