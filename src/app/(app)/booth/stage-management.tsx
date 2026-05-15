"use client";

import { useState } from "react";
import { submitReport, updateScene, updateProp, addProp } from "./sm-actions";
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

interface Props {
  scenes: Scene[];
  props: Prop[];
  reports: Report[];
  productionId: string;
  productionTitle: string;
}

export function StageManagement({ scenes, props: propsList, reports, productionId, productionTitle }: Props) {
  const [tab, setTab] = useState<"scenes" | "props" | "reports" | "new_report">("scenes");
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [addingProp, setAddingProp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

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
      {tab === "new_report" && (
        <form action={(fd) => { fd.set("production_id", productionId); handleAction(submitReport, fd).then(() => setTab("reports")); }}
          className="bg-card border border-bone rounded-card px-4 md:px-6 py-5 space-y-4">
          <h3 className="text-body-md font-medium text-ink">New Rehearsal Report</h3>
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
            <label className="block text-body-xs text-brick mb-1">Absent / Late</label>
            <input name="absent_late" placeholder="Names and reasons" className="w-full px-3 py-1.5 bg-paper border border-brick/20 rounded-card text-body-sm text-ink focus:border-brick focus:outline-none" />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Work Completed / Scenes Rehearsed</label>
            <textarea name="work_completed" rows={3} placeholder="What was accomplished today" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Director Notes</label>
            <textarea name="director_notes" rows={2} placeholder="Notes from the director" className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-body-xs text-brick mb-1">Action Items</label>
            <textarea name="action_items" rows={2} placeholder="Follow-ups for departments" className="w-full px-3 py-1.5 bg-paper border border-brick/20 rounded-card text-body-sm text-ink focus:border-brick focus:outline-none resize-none" />
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
