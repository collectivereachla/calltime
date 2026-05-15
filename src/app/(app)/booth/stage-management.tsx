"use client";

import { useState } from "react";

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
  work_completed: string | null; director_notes: string | null;
  absent_late: string | null; action_items: string | null;
}

interface Props {
  scenes: Scene[];
  props: Prop[];
  reports: Report[];
  productionTitle: string;
}

const statusColors: Record<string, string> = {
  open: "bg-ash/10 text-ash",
  in_progress: "bg-tentative/10 text-tentative",
  set: "bg-confirmed/10 text-confirmed",
  cut: "bg-conflict/10 text-conflict",
};

export function StageManagement({ scenes, props: propsList, reports, productionTitle }: Props) {
  const [tab, setTab] = useState<"scenes" | "props" | "reports">("scenes");

  const tabs = [
    { key: "scenes" as const, label: "Scene Breakdown", count: scenes.length },
    { key: "props" as const, label: "Props", count: propsList.length },
    { key: "reports" as const, label: "Reports", count: reports.length },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-body-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-ink text-paper" : "text-ash hover:text-ink border border-bone"
            }`}>
            {t.label} <span className="ml-1 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Scene Breakdown */}
      {tab === "scenes" && (
        <div className="space-y-3">
          {scenes.map((s) => (
            <div key={s.id} className="bg-card border border-bone rounded-card px-4 md:px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <span className="font-mono text-data-sm text-ash">A{s.act}-S{s.scene_number}</span>
                  <h3 className="text-body-md font-medium text-ink mt-0.5">
                    {s.title || `Scene ${s.scene_number}`}
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  {s.location && <p className="text-body-xs text-ash">{s.location}</p>}
                  {s.time_period && <p className="text-body-xs text-muted">{s.time_period}</p>}
                </div>
              </div>

              {s.description && (
                <p className="text-body-sm text-ash mb-3">{s.description}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {s.characters_tracks && (
                  <div>
                    <p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Characters</p>
                    <p className="text-body-xs text-ink">{s.characters_tracks}</p>
                  </div>
                )}
                {s.music_sound && (
                  <div>
                    <p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Music / Sound</p>
                    <p className="text-body-xs text-ink">{s.music_sound}</p>
                  </div>
                )}
                {s.props_practicals && (
                  <div>
                    <p className="text-body-xs text-muted uppercase tracking-wider mb-0.5">Props</p>
                    <p className="text-body-xs text-ink">{s.props_practicals}</p>
                  </div>
                )}
                {s.sm_watchouts && (
                  <div className="md:col-span-2">
                    <p className="text-body-xs text-brick uppercase tracking-wider mb-0.5">SM Watchouts</p>
                    <p className="text-body-xs text-ink">{s.sm_watchouts}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Props Tracker */}
      {tab === "props" && (
        <div className="overflow-x-auto border border-bone rounded-card">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-bone/20">
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Prop</th>
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Scenes</th>
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Used By</th>
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Preset</th>
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Tracking</th>
                <th className="px-3 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Backup</th>
                <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Status</th>
              </tr>
            </thead>
            <tbody>
              {propsList.map((prop) => (
                <tr key={prop.id} className="hover:bg-brick/3 transition-colors">
                  <td className="px-3 py-2 border-b border-bone text-body-sm font-medium text-ink">{prop.prop_name}</td>
                  <td className="px-3 py-2 border-b border-bone font-mono text-data-sm text-ash">{prop.scenes || "—"}</td>
                  <td className="px-3 py-2 border-b border-bone text-body-xs text-ash">{prop.used_by || "—"}</td>
                  <td className="px-3 py-2 border-b border-bone text-body-xs text-ash">{prop.preset_location || "—"}</td>
                  <td className="px-3 py-2 border-b border-bone text-body-xs text-muted">{prop.handoff_tracking || "—"}</td>
                  <td className="px-3 py-2 border-b border-bone text-center">{prop.has_backup ? "✓" : "—"}</td>
                  <td className="px-3 py-2 border-b border-bone">
                    <span className={`text-body-xs px-1.5 py-0.5 rounded ${statusColors[prop.status]}`}>
                      {prop.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rehearsal Reports */}
      {tab === "reports" && (
        <div>
          {reports.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No reports yet.</p>
              <p className="text-body-xs text-muted mt-1">
                After each rehearsal, the SM submits a report through Calltime.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="bg-card border border-bone rounded-card px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-data-sm text-ink">
                      {new Date(r.report_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                    </span>
                    <span className="text-body-xs px-1.5 py-0.5 rounded bg-ink/5 text-ash">
                      {r.report_type}
                    </span>
                  </div>
                  {r.work_completed && <p className="text-body-sm text-ink mb-1">{r.work_completed}</p>}
                  {r.director_notes && <p className="text-body-xs text-ash">{r.director_notes}</p>}
                  {r.action_items && <p className="text-body-xs text-brick mt-1">{r.action_items}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
