"use client";

import { useState } from "react";
import { submitReport, updateScene, updateProp, addProp, addActionItem, toggleActionItem } from "./sm-actions";
import { useRouter } from "next/navigation";

interface Scene {
  id: string; act: number; scene_number: number; title: string | null;
  description: string | null; location: string | null; time_period: string | null;
  characters_tracks: string | null; music_sound: string | null;
  props_practicals: string | null; sm_watchouts: string | null;
}

interface Prop {
  id: string; prop_name: string; scenes: string | null; used_by: string | null;
  preset_location: string | null; handoff_tracking: string | null;
  has_backup: boolean; status: string; notes: string | null;
}

interface Report {
  id: string; report_date: string; report_type: string;
  start_time: string | null; end_time: string | null;
  work_completed: string | null; director_notes: string | null;
  absent_late: string | null; action_items: string | null;
  next_call: string | null; called: string | null;
}

interface ActionItem {
  id: string; description: string; assigned_to: string | null;
  assigned_by: string | null; department: string | null;
  status: string; due_date: string | null; created_at: string;
}

interface EventForReport {
  id: string; title: string; event_date: string;
  conflicts: string | null;
}

interface CastMember {
  person_id: string; name: string; role_title: string;
}

interface Props {
  scenes: Scene[];
  props: Prop[];
  reports: Report[];
  actionItems: ActionItem[];
  events: EventForReport[];
  cast: CastMember[];
  productionId: string;
  productionTitle: string;
}

export function StageManagement({ scenes, props: propsList, reports, actionItems, events, cast, productionId, productionTitle }: Props) {
  const [tab, setTab] = useState<"scenes" | "props" | "reports" | "actions" | "new_report">("scenes");
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [addingProp, setAddingProp] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [absentField, setAbsentField] = useState("");
  const router = useRouter();

  const openActions = actionItems.filter(a => a.status !== "done").length;

  async function handleAction(action: (fd: FormData) => Promise<{ error?: string; success?: boolean }>, formData: FormData) {
    setLoading(true);
    const result = await action(formData);
    setLoading(false);
    if (result?.error) { alert(result.error); return; }
    setEditingScene(null);
    setEditingProp(null);
    setAddingProp(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const tabs = [
    { key: "scenes" as const, label: "Scene Breakdown", count: scenes.length },
    { key: "props" as const, label: "Props", count: propsList.length },
    { key: "reports" as const, label: "Reports", count: reports.length },
    { key: "actions" as const, label: "Action Items", count: openActions || null },
    { key: "new_report" as const, label: "+ New Report", count: null },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-body-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-ink text-paper" : "text-ash hover:text-ink border border-bone"
            }`}>
            {t.label}{t.count !== null && <span className="ml-1 opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>

      {saved && <p className="text-body-xs text-confirmed mb-3">Saved.</p>}

      {/* Scene Breakdown — editable */}
      {tab === "scenes" && (
        <div className="space-y-3">
          {scenes.map((s) => {
            const isEditing = editingScene === s.id;
            return (
              <div key={s.id} className="bg-card border border-bone rounded-card px-4 md:px-5 py-4">
                {isEditing ? (
                  <form action={(fd) => { fd.set("scene_id", s.id); handleAction(updateScene, fd); }} className="space-y-3">
                    <input type="hidden" name="scene_id" value={s.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-body-xs text-ash mb-1">Title</label>
                        <input name="title" defaultValue={s.title || ""} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-body-xs text-ash mb-1">Location</label>
                        <input name="location" defaultValue={s.location || ""} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-body-xs text-ash mb-1">Description</label>
                      <textarea name="description" defaultValue={s.description || ""} rows={2} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
                    </div>
                    <div>
                      <label className="block text-body-xs text-ash mb-1">Characters / Tracks</label>
                      <input name="characters_tracks" defaultValue={s.characters_tracks || ""} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-body-xs text-ash mb-1">Music / Sound</label>
                        <input name="music_sound" defaultValue={s.music_sound || ""} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-body-xs text-ash mb-1">Props / Practicals</label>
                        <input name="props_practicals" defaultValue={s.props_practicals || ""} className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-body-xs text-brick mb-1">SM Watchouts</label>
                      <textarea name="sm_watchouts" defaultValue={s.sm_watchouts || ""} rows={2} className="w-full px-3 py-1.5 bg-paper border border-brick/20 rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={loading} className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card disabled:opacity-50">{loading ? "..." : "Save"}</button>
                      <button type="button" onClick={() => setEditingScene(null)} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <span className="font-mono text-data-sm text-ash">A{s.act}-S{s.scene_number}</span>
                        <h3 className="text-body-md font-medium text-ink mt-0.5">{s.title || `Scene ${s.scene_number}`}</h3>
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        {s.location && <p className="text-body-xs text-ash">{s.location}</p>}
                        <button onClick={() => setEditingScene(s.id)} className="text-body-xs text-muted hover:text-brick transition-colors">Edit</button>
                      </div>
                    </div>
                    {s.description && <p className="text-body-sm text-ash mb-3">{s.description}</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {s.characters_tracks && (<div><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Characters</p><p className="text-body-xs text-ink">{s.characters_tracks}</p></div>)}
                      {s.music_sound && (<div><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Music / Sound</p><p className="text-body-xs text-ink">{s.music_sound}</p></div>)}
                      {s.props_practicals && (<div><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Props</p><p className="text-body-xs text-ink">{s.props_practicals}</p></div>)}
                      {s.sm_watchouts && (<div className="md:col-span-2"><p className="text-body-xs text-brick uppercase tracking-wider mb-0.5">SM Watchouts</p><p className="text-body-xs text-ink">{s.sm_watchouts}</p></div>)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Props — editable */}
      {tab === "props" && (
        <div>
          <div className="space-y-2 mb-4">
            {propsList.map((prop) => {
              const isEditing = editingProp === prop.id;
              if (isEditing) {
                return (
                  <form key={prop.id} action={(fd) => { fd.set("prop_id", prop.id); handleAction(updateProp, fd); }}
                    className="bg-card border border-brick/20 rounded-card px-4 py-3 space-y-2">
                    <input type="hidden" name="prop_id" value={prop.id} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <input name="prop_name" defaultValue={prop.prop_name} placeholder="Prop name" required className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
                      <input name="scenes" defaultValue={prop.scenes || ""} placeholder="Scenes" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
                      <input name="used_by" defaultValue={prop.used_by || ""} placeholder="Used by" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
                      <input name="preset_location" defaultValue={prop.preset_location || ""} placeholder="Preset location" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
                      <input name="handoff_tracking" defaultValue={prop.handoff_tracking || ""} placeholder="Handoff" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
                      <select name="status" defaultValue={prop.status} className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:outline-none">
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="set">Set</option>
                        <option value="cut">Cut</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-body-xs text-ash"><input type="checkbox" name="has_backup" defaultChecked={prop.has_backup} /> Backup</label>
                      <input name="notes" defaultValue={prop.notes || ""} placeholder="Notes" className="flex-1 px-2 py-1 bg-paper border border-bone rounded text-body-xs text-ink focus:border-brick focus:outline-none" />
                      <button type="submit" disabled={loading} className="px-3 py-1 bg-ink text-paper text-body-xs rounded disabled:opacity-50">{loading ? "..." : "Save"}</button>
                      <button type="button" onClick={() => setEditingProp(null)} className="text-body-xs text-ash hover:text-ink">Cancel</button>
                    </div>
                  </form>
                );
              }
              return (
                <div key={prop.id} onClick={() => setEditingProp(prop.id)}
                  className="bg-card border border-bone rounded-card px-4 py-2.5 flex items-center gap-4 cursor-pointer hover:border-brick/20 transition-colors">
                  <span className="text-body-sm font-medium text-ink w-36 shrink-0">{prop.prop_name}</span>
                  <span className="font-mono text-data-sm text-ash w-28 shrink-0">{prop.scenes || "—"}</span>
                  <span className="text-body-xs text-ash flex-1 truncate">{prop.used_by || "—"}</span>
                  <span className="text-body-xs text-muted truncate hidden md:block">{prop.preset_location || "—"}</span>
                  <span className={`text-body-xs px-1.5 py-0.5 rounded shrink-0 ${
                    prop.status === "set" ? "bg-confirmed/10 text-confirmed" :
                    prop.status === "in_progress" ? "bg-tentative/10 text-tentative" :
                    prop.status === "cut" ? "bg-conflict/10 text-conflict" :
                    "bg-ash/10 text-ash"
                  }`}>{prop.status}</span>
                </div>
              );
            })}
          </div>
          {!addingProp ? (
            <button onClick={() => setAddingProp(true)} className="w-full py-2.5 border border-dashed border-bone rounded-card text-body-xs text-ash hover:text-brick hover:border-brick/30 transition-colors">+ Add prop</button>
          ) : (
            <form action={(fd) => { fd.set("production_id", productionId); handleAction(addProp, fd); }} className="bg-brick/5 border border-dashed border-brick/20 rounded-card px-4 py-3 flex flex-wrap gap-2">
              <input name="prop_name" placeholder="Prop name" required className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
              <input name="scenes" placeholder="Scenes" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
              <input name="used_by" placeholder="Used by" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
              <input name="preset_location" placeholder="Preset" className="px-2 py-1 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none" />
              <button type="submit" disabled={loading} className="px-3 py-1 bg-ink text-paper text-body-xs font-medium rounded disabled:opacity-50">{loading ? "..." : "Add"}</button>
              <button type="button" onClick={() => setAddingProp(false)} className="text-body-xs text-ash hover:text-ink">Cancel</button>
            </form>
          )}
        </div>
      )}

      {/* Reports list */}
      {tab === "reports" && (
        <div>
          {reports.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No reports yet.</p>
              <p className="text-body-xs text-muted mt-1">Click "+ New Report" to file one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="bg-card border border-bone rounded-card px-4 md:px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-data-sm text-ink">{new Date(r.report_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span className="text-body-xs px-1.5 py-0.5 rounded bg-ink/5 text-ash">{r.report_type}</span>
                    </div>
                    {r.start_time && r.end_time && (
                      <span className="font-mono text-data-sm text-muted">{r.start_time.slice(0,5)}–{r.end_time.slice(0,5)}</span>
                    )}
                  </div>
                  {r.called && (<div className="mb-2"><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Called</p><p className="text-body-sm text-ink">{r.called}</p></div>)}
                  {r.absent_late && (<div className="mb-2"><p className="text-body-xs text-brick uppercase tracking-wider mb-0.5">Absent / Late</p><p className="text-body-sm text-ink">{r.absent_late}</p></div>)}
                  {r.work_completed && (<div className="mb-2"><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Work Completed</p><p className="text-body-sm text-ink">{r.work_completed}</p></div>)}
                  {r.director_notes && (<div className="mb-2"><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Director Notes</p><p className="text-body-sm text-ink">{r.director_notes}</p></div>)}
                  {r.action_items && (<div className="mb-2"><p className="text-body-xs text-brick uppercase tracking-wider mb-0.5">Action Items</p><p className="text-body-sm text-ink">{r.action_items}</p></div>)}
                  {r.next_call && (<div><p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Next Call</p><p className="text-body-sm text-ink font-medium">{r.next_call}</p></div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Report form */}
      {/* Action Items checklist */}
      {tab === "actions" && (
        <div>
          {!addingAction ? (
            <button onClick={() => setAddingAction(true)} className="w-full py-2.5 border border-dashed border-bone rounded-card text-body-xs text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add action item
            </button>
          ) : (
            <form action={(fd) => { fd.set("production_id", productionId); handleAction(addActionItem, fd).then(() => setAddingAction(false)); }}
              className="bg-brick/5 border border-dashed border-brick/20 rounded-card px-4 py-3 mb-4 space-y-2">
              <input name="description" placeholder="What needs to happen?" required className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
              <div className="flex flex-wrap gap-2">
                <select name="assigned_to" className="px-2 py-1 bg-paper border border-bone rounded text-body-xs text-ink focus:outline-none">
                  <option value="">Assign to...</option>
                  {cast.map(c => <option key={c.person_id} value={c.person_id}>{c.name} — {c.role_title}</option>)}
                </select>
                <select name="department" className="px-2 py-1 bg-paper border border-bone rounded text-body-xs text-ink focus:outline-none">
                  <option value="">Department...</option>
                  <option value="scenic">Scenic</option><option value="props">Props</option>
                  <option value="costumes">Costumes</option><option value="lights">Lights</option>
                  <option value="sound">Sound</option><option value="sm">SM</option>
                  <option value="director">Director</option><option value="all">All</option>
                </select>
                <input name="due_date" type="date" className="px-2 py-1 bg-paper border border-bone rounded text-body-xs text-ink font-mono focus:outline-none" />
                <button type="submit" disabled={loading} className="px-3 py-1 bg-ink text-paper text-body-xs rounded disabled:opacity-50">{loading ? "..." : "Add"}</button>
                <button type="button" onClick={() => setAddingAction(false)} className="text-body-xs text-ash hover:text-ink">Cancel</button>
              </div>
            </form>
          )}

          {actionItems.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No action items yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {actionItems.filter(a => a.status !== "done").map(item => {
                const assignee = item.assigned_to ? cast.find(c => c.person_id === item.assigned_to) : null;
                return (
                  <div key={item.id} className="flex items-start gap-3 bg-card border border-bone rounded-card px-4 py-2.5 hover:border-brick/20 transition-colors">
                    <button onClick={async () => { await toggleActionItem(item.id, true); router.refresh(); }}
                      className="w-4 h-4 mt-0.5 rounded border border-bone hover:border-brick shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-ink">{item.description}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {assignee && <span className="text-body-xs text-brick">→ {assignee.name}</span>}
                        {item.department && <span className="text-body-xs text-ash bg-ash/10 px-1.5 py-0.5 rounded">{item.department}</span>}
                        {item.due_date && <span className="font-mono text-[10px] text-muted">{item.due_date}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {actionItems.filter(a => a.status === "done").length > 0 && (
                <details className="mt-3">
                  <summary className="text-body-xs text-muted cursor-pointer">{actionItems.filter(a => a.status === "done").length} completed</summary>
                  <div className="space-y-1 mt-2">
                    {actionItems.filter(a => a.status === "done").map(item => (
                      <div key={item.id} className="flex items-start gap-3 px-4 py-2 opacity-50">
                        <button onClick={async () => { await toggleActionItem(item.id, false); router.refresh(); }}
                          className="w-4 h-4 mt-0.5 rounded bg-confirmed border border-confirmed text-paper text-[10px] flex items-center justify-center shrink-0">✓</button>
                        <p className="text-body-sm text-ash line-through">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Report form with event auto-population */}
      {tab === "new_report" && (
        <form action={(fd) => { fd.set("production_id", productionId); handleAction(submitReport, fd).then(() => setTab("reports")); }}
          className="bg-card border border-bone rounded-card px-4 md:px-6 py-5 space-y-4">
          <h3 className="text-body-md font-medium text-ink">New Rehearsal Report</h3>

          {/* Event selector — auto-populates absent and work fields */}
          {events.length > 0 && (
            <div>
              <label className="block text-body-xs text-ash mb-1">Link to event (auto-fills absent/late from conflicts)</label>
              <select
                value={selectedEvent}
                onChange={(e) => {
                  setSelectedEvent(e.target.value);
                  const evt = events.find(ev => ev.id === e.target.value);
                  if (evt?.conflicts) setAbsentField(evt.conflicts);
                }}
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:outline-none">
                <option value="">Select today&rsquo;s event...</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.event_date} — {e.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Date</label>
              <input name="report_date" type="date" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })} required className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none" />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Type</label>
              <select name="report_type" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:outline-none">
                <option value="rehearsal">Rehearsal</option>
                <option value="performance">Performance</option>
              </select>
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Start</label>
              <input name="start_time" type="time" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none" />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">End</label>
              <input name="end_time" type="time" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Called</label>
            <input name="called" placeholder="Full cast, Act I cast, etc." className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
          </div>
          <div>
            <label className="block text-body-xs text-brick mb-1">Absent / Late {absentField && "(auto-filled from conflicts)"}</label>
            <textarea name="absent_late" value={absentField} onChange={(e) => setAbsentField(e.target.value)} rows={2} placeholder="Names and reasons — auto-fills when you select an event above" className="w-full px-3 py-1.5 bg-paper border border-brick/20 rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Work Completed / Scenes Rehearsed</label>
            <textarea name="work_completed" rows={3} defaultValue={selectedEvent ? events.find(e => e.id === selectedEvent)?.title || "" : ""} placeholder="What was accomplished today" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Director Notes</label>
            <textarea name="director_notes" rows={2} placeholder="Notes from the director" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-brick mb-1">Action Items</label>
            <textarea name="action_items" rows={2} placeholder="Follow-ups for departments — these will also appear in the Action Items checklist" className="w-full px-3 py-1.5 bg-paper border border-brick/20 rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Next Call</label>
            <input name="next_call" placeholder="Saturday 6:45 PM — Full Cast — DOF Sanctuary" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
            {loading ? "Submitting..." : "Submit Report"}
          </button>
        </form>
      )}
    </div>
  );
}
