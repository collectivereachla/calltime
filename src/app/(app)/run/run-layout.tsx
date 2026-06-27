"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { StageTracking } from "./stage-tracking";
import { CallingScript, type CallingLine, type CallingCue } from "./calling-script";
import { WeaponsLog, type WeaponProp, type CustodyEntry, type RosterPerson } from "./weapons-log";
import {
  addRunSheetItem, toggleRunSheetItem, deleteRunSheetItem, resetRunSheet,
  submitShowReport, logRehearsalWork,
} from "./actions";

type TrackingProps = ComponentProps<typeof StageTracking>;

interface TodayEvent {
  id: string; title: string; event_type: string;
  start_time: string | null; end_time: string | null; location: string | null; notes: string | null;
  calls: { id: string; person_id: string; name: string; phone: string | null; status: string | null; conflict_reason: string | null; }[];
}

interface RunSheetItem {
  id: string; category: string; label: string;
  assigned_to: string | null; time_estimate: string | null;
  notes: string | null; completed: boolean; sort_order: number;
}

interface Report {
  id: string; report_type: string; report_date: string;
  start_time: string | null; end_time: string | null;
  called: string | null; absent_late: string | null;
  work_completed: string | null; director_notes: string | null;
  action_items: string | null; next_call: string | null;
  completed_by_name: string | null;
}

interface Scene { id: string; act: number; scene_number: number; title: string | null; }
interface WorkEntry { id: string; work_type: string; run_count: number; notes: string | null; created_at: string; scene_label: string | null; }

interface Props {
  production: { id: string; title: string; status: string; org_id: string; };
  canManage: boolean;
  personId: string;
  today: string;
  todayEvents: TodayEvent[];
  runSheetItems: RunSheetItem[];
  reports: Report[];
  scenes: Scene[];
  workLog: WorkEntry[];
  trackingScenes: TrackingProps["scenes"];
  stageProps: TrackingProps["props"];
  actionItems: TrackingProps["actionItems"];
  cast: TrackingProps["cast"];
  callingLines: CallingLine[];
  callingCues: CallingCue[];
  scriptVersionLabel: string | null;
  weapons: WeaponProp[];
  custodyEntries: CustodyEntry[];
  custodyRoster: RosterPerson[];
  orgTz: string;
}

const TABS = ["Today", "Run Sheet", "Calling Script", "Tracking", "Weapons Log", "Reports", "Work Log"] as const;

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${period}`;
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "text-confirmed bg-confirmed/10",
  tentative: "text-tentative bg-tentative/10",
  conflict: "text-conflict bg-conflict/10",
};

const RUN_CATEGORIES = [
  { value: "preshow", label: "Preshow" },
  { value: "act_1", label: "Act 1" },
  { value: "intermission", label: "Intermission" },
  { value: "act_2", label: "Act 2" },
  { value: "post_show", label: "Post-Show" },
];

const inputClass = "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

export function RunLayout({ production, canManage, personId, today, todayEvents, runSheetItems, reports, scenes, workLog, trackingScenes, stageProps, actionItems, cast, callingLines, callingCues, scriptVersionLabel, weapons, custodyEntries, custodyRoster, orgTz }: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>("Today");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-display-md">Run</h1>
          <p className="text-body-sm text-ash mt-1">{production.title}</p>
        </div>
        <a href="/blocking" className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors shrink-0">
          Blocking Map
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TABS.filter(t => (t !== "Tracking" && t !== "Weapons Log") || canManage).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 text-body-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              tab === t ? "bg-ink text-paper" : "text-ash hover:text-ink"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TODAY'S CALL ═══ */}
      {tab === "Today" && (
        <div>
          {todayEvents.length === 0 ? (
            <div className="bg-card border border-bone rounded-card p-6 text-center">
              <p className="text-body-md text-ash">Nothing called for today.</p>
              <p className="text-body-sm text-muted mt-1">
                {new Date(today + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayEvents.map(event => {
                const confirmed = event.calls.filter(c => c.status === "confirmed").length;
                const total = event.calls.length;
                return (
                  <div key={event.id} className="bg-card border border-bone rounded-card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-body-xs text-muted uppercase tracking-wider">{event.event_type.replace(/_/g, " ")}</p>
                        <h3 className="font-display text-display-sm mt-0.5">{event.title}</h3>
                        <p className="font-mono text-data-sm text-ash mt-1">
                          {formatTime(event.start_time)}{event.end_time ? `–${formatTime(event.end_time)}` : ""}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-data-md text-ink">{confirmed}/{total}</p>
                        <p className="text-body-xs text-muted">confirmed</p>
                      </div>
                    </div>

                    {event.notes && <p className="text-body-sm text-ash mb-3">{event.notes}</p>}

                    <div className="space-y-1">
                      {event.calls.map(call => (
                        <div key={call.id} className="flex items-center justify-between py-1.5 border-b border-bone/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-body-xs px-1.5 py-0.5 rounded ${
                              call.status ? STATUS_COLORS[call.status] || "text-muted bg-bone/30" : "text-muted bg-bone/30"
                            }`}>
                              {call.status || "—"}
                            </span>
                            <span className="text-body-sm text-ink">{call.name}</span>
                          </div>
                          {call.phone && canManage && (
                            <a href={`tel:${call.phone}`} className="text-body-xs text-muted hover:text-brick transition-colors">
                              call
                            </a>
                          )}
                        </div>
                      ))}
                    </div>

                    {event.calls.some(c => c.status === "conflict") && (
                      <div className="mt-3 pt-3 border-t border-bone">
                        <p className="text-body-xs font-medium text-conflict mb-1">Conflicts</p>
                        {event.calls.filter(c => c.status === "conflict").map(c => (
                          <p key={c.id} className="text-body-xs text-ash">
                            <span className="font-medium text-ink">{c.name}</span>
                            {c.conflict_reason ? `: ${c.conflict_reason}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ RUN SHEET ═══ */}
      {tab === "Run Sheet" && (
        <div>
          {canManage && runSheetItems.length > 0 && (
            <button onClick={async () => { await resetRunSheet(production.id); router.refresh(); }}
              className="text-body-xs text-muted hover:text-brick transition-colors mb-4">
              Reset all checkboxes
            </button>
          )}

          {RUN_CATEGORIES.map(cat => {
            const items = runSheetItems.filter(i => i.category === cat.value);
            return (
              <div key={cat.value} className="mb-6">
                <p className="text-body-xs text-muted uppercase tracking-wider mb-2">{cat.label}</p>
                {items.length === 0 && !canManage ? (
                  <p className="text-body-sm text-muted py-2">No items yet.</p>
                ) : (
                  <div className="space-y-1">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 bg-card border border-bone rounded-card px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={async (e) => { await toggleRunSheetItem(item.id, e.target.checked); router.refresh(); }}
                          disabled={!canManage}
                          className="rounded border-bone text-confirmed focus:ring-confirmed shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-body-sm ${item.completed ? "line-through text-muted" : "text-ink"}`}>
                            {item.label}
                          </p>
                          {(item.assigned_to || item.time_estimate) && (
                            <p className="text-body-xs text-muted mt-0.5">
                              {item.assigned_to}{item.assigned_to && item.time_estimate ? " · " : ""}{item.time_estimate}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <button onClick={async () => { await deleteRunSheetItem(item.id); router.refresh(); }}
                            className="text-body-xs text-muted hover:text-brick transition-colors shrink-0">×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canManage && (
                  <AddRunSheetItemForm productionId={production.id} category={cat.value} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CALLING SCRIPT ═══ */}
      {tab === "Calling Script" && (
        <CallingScript
          productionId={production.id}
          canManage={canManage}
          scriptVersionLabel={scriptVersionLabel}
          lines={callingLines}
          cues={callingCues}
        />
      )}

      {/* ═══ WEAPONS LOG ═══ */}
      {tab === "Weapons Log" && canManage && (
        <WeaponsLog
          productionId={production.id}
          weapons={weapons}
          entries={custodyEntries}
          roster={custodyRoster}
          orgTz={orgTz}
        />
      )}

      {/* ═══ TRACKING (scene breakdown · props · action items) ═══ */}
      {tab === "Tracking" && canManage && (
        <StageTracking
          scenes={trackingScenes}
          props={stageProps}
          actionItems={actionItems}
          cast={cast}
          productionId={production.id}
        />
      )}

      {/* ═══ REPORTS ═══ */}
      {tab === "Reports" && (
        <div>
          {canManage && <ReportForm productionId={production.id} today={today} />}

          {reports.length === 0 ? (
            <p className="text-body-sm text-muted py-4">No reports filed yet.</p>
          ) : (
            <div className="space-y-3 mt-4">
              {reports.map(r => (
                <details key={r.id} className="bg-card border border-bone rounded-card">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-bone/10 transition-colors">
                    <span className="text-body-sm font-medium text-ink">
                      {r.report_type === "performance" ? "Show" : "Rehearsal"} Report — {new Date(r.report_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    {r.completed_by_name && <span className="text-body-xs text-muted ml-2">by {r.completed_by_name}</span>}
                  </summary>
                  <div className="px-4 pb-4 space-y-2 text-body-sm">
                    {r.start_time && <p><span className="text-ash">Time:</span> {formatTime(r.start_time)}{r.end_time ? `–${formatTime(r.end_time)}` : ""}</p>}
                    {r.called && <p><span className="text-ash">Called:</span> {r.called}</p>}
                    {r.absent_late && <p><span className="text-ash">Absent/Late:</span> <span className="text-conflict">{r.absent_late}</span></p>}
                    {r.work_completed && <p><span className="text-ash">Work completed:</span> {r.work_completed}</p>}
                    {r.director_notes && <p><span className="text-ash">Director notes:</span> {r.director_notes}</p>}
                    {r.action_items && <p><span className="text-ash">Action items:</span> {r.action_items}</p>}
                    {r.next_call && <p><span className="text-ash">Next call:</span> {r.next_call}</p>}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ WORK LOG ═══ */}
      {tab === "Work Log" && (
        <div>
          {canManage && <WorkLogForm productionId={production.id} scenes={scenes} />}

          {workLog.length === 0 ? (
            <p className="text-body-sm text-muted py-4">No rehearsal work logged yet.</p>
          ) : (
            <div className="space-y-2 mt-4">
              {workLog.map(w => (
                <div key={w.id} className="bg-card border border-bone rounded-card px-4 py-3">
                  <p className="text-body-sm text-ink">
                    <span className="font-medium">{w.work_type.replace(/_/g, " ")}</span>
                    {w.scene_label ? ` — ${w.scene_label}` : ""}
                    {w.run_count > 1 ? ` (×${w.run_count})` : ""}
                  </p>
                  {w.notes && <p className="text-body-xs text-ash mt-0.5">{w.notes}</p>}
                  <p className="text-body-xs text-muted mt-1">{timeAgo(w.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline forms ──

function AddRunSheetItemForm({ productionId, category }: { productionId: string; category: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-body-xs text-muted hover:text-ink transition-colors mt-2">+ Add item</button>
  );

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true);
      const fd = new FormData(e.currentTarget);
      fd.set("production_id", productionId);
      fd.set("category", category);
      await addRunSheetItem(fd);
      setLoading(false);
      setOpen(false);
      router.refresh();
    }} className="mt-2 flex gap-2">
      <input name="label" required placeholder="Item..." className={`${inputClass} flex-1 !py-1.5 text-body-sm`} />
      <input name="assigned_to" placeholder="Who" className={`${inputClass} w-20 !py-1.5 text-body-sm`} />
      <button type="submit" disabled={loading} className="px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-body-xs text-muted">×</button>
    </form>
  );
}

function ReportForm({ productionId, today }: { productionId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">
      New report
    </button>
  );

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true);
      const fd = new FormData(e.currentTarget);
      fd.set("production_id", productionId);
      await submitShowReport(fd);
      setLoading(false);
      setOpen(false);
      router.refresh();
    }} className="bg-card border border-bone rounded-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm text-ash mb-1">Type</label>
          <select name="report_type" className={inputClass}>
            <option value="rehearsal">Rehearsal</option>
            <option value="performance">Performance</option>
          </select>
        </div>
        <div>
          <label className="block text-body-sm text-ash mb-1">Date</label>
          <input type="date" name="report_date" defaultValue={today} required className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm text-ash mb-1">Start</label>
          <input type="time" name="start_time" className={inputClass} />
        </div>
        <div>
          <label className="block text-body-sm text-ash mb-1">End</label>
          <input type="time" name="end_time" className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Absent / Late</label>
        <input type="text" name="absent_late" placeholder="Who was missing or late" className={inputClass} />
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Work completed</label>
        <textarea name="work_completed" rows={2} placeholder="What was worked" className={inputClass} />
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Director notes</label>
        <textarea name="director_notes" rows={2} className={inputClass} />
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Action items</label>
        <textarea name="action_items" rows={2} className={inputClass} />
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Next call</label>
        <input type="text" name="next_call" placeholder="Tomorrow at 6:30pm, full company" className={inputClass} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">
          {loading ? "Filing..." : "File report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
      </div>
    </form>
  );
}

function WorkLogForm({ productionId, scenes }: { productionId: string; scenes: Scene[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">
      Log work
    </button>
  );

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true);
      const fd = new FormData(e.currentTarget);
      fd.set("production_id", productionId);
      await logRehearsalWork(fd);
      setLoading(false);
      setOpen(false);
      router.refresh();
    }} className="bg-card border border-bone rounded-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm text-ash mb-1">Type</label>
          <select name="work_type" className={inputClass}>
            <option value="scene_work">Scene work</option>
            <option value="stumble_through">Stumble through</option>
            <option value="run_through">Run through</option>
            <option value="tech_run">Tech run</option>
            <option value="dress">Dress rehearsal</option>
            <option value="choreo">Choreography</option>
            <option value="music">Music rehearsal</option>
            <option value="fight_call">Fight call</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-body-sm text-ash mb-1">Scene</label>
          <select name="scene_id" className={inputClass}>
            <option value="">Full show / N/A</option>
            {scenes.map(s => (
              <option key={s.id} value={s.id}>
                Act {s.act}, Sc {s.scene_number}{s.title ? `: ${s.title}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm text-ash mb-1">Times run</label>
          <input type="number" name="run_count" defaultValue={1} min={1} className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-body-sm text-ash mb-1">Notes</label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">
          {loading ? "Logging..." : "Log"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
      </div>
    </form>
  );
}
