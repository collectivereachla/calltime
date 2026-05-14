"use client";

import { useState } from "react";
import { upsertCostumePlot } from "./actions";
import { useRouter } from "next/navigation";

interface Scene {
  id: string;
  act: number;
  scene_number: number;
  title: string | null;
}

interface CastMember {
  person_id: string;
  name: string;
  role_title: string;
}

interface CostumeEntry {
  scene_id: string;
  person_id: string;
  character_name: string;
  costume_description: string | null;
  change_notes: string | null;
  change_location: string | null;
  status: string;
  image_url: string | null;
}

interface Props {
  productionId: string;
  scenes: Scene[];
  cast: CastMember[];
  entries: CostumeEntry[];
}

const statusColors: Record<string, string> = {
  planned: "bg-ash/10 border-ash/20",
  in_progress: "bg-tentative/10 border-tentative/20",
  fitted: "bg-brick/10 border-brick/20",
  ready: "bg-confirmed/10 border-confirmed/20",
};

const statusDot: Record<string, string> = {
  planned: "bg-ash/40",
  in_progress: "bg-tentative",
  fitted: "bg-brick",
  ready: "bg-confirmed",
};

export function CostumePlot({ productionId, scenes, cast, entries }: Props) {
  const [editing, setEditing] = useState<string | null>(null); // "personId-sceneId"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Build lookup: key = "personId-sceneId"
  const entryMap = new Map<string, CostumeEntry>();
  for (const e of entries) {
    entryMap.set(`${e.person_id}-${e.scene_id}`, e);
  }

  // Group scenes by act
  const act1 = scenes.filter((s) => s.act === 1);
  const act2 = scenes.filter((s) => s.act === 2);

  async function handleSave(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await upsertCostumePlot(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setEditing(null);
    router.refresh();
  }

  return (
    <div>
      {error && <p className="text-body-xs text-brick mb-3">{error}</p>}

      {cast.length === 0 ? (
        <p className="text-body-md text-ash">No cast members assigned to this production.</p>
      ) : scenes.length === 0 ? (
        <p className="text-body-md text-ash">No scenes created yet.</p>
      ) : (
        <div className="overflow-x-auto border border-bone rounded-card">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-bone/30">
                <th className="sticky left-0 z-10 bg-bone/30 px-3 py-2 text-left text-body-xs text-muted uppercase tracking-wider border-b border-r border-bone w-48">
                  Actor / Role
                </th>
                {act1.length > 0 && (
                  <th colSpan={act1.length} className="px-2 py-1 text-center text-body-xs text-muted uppercase tracking-wider border-b border-bone bg-ink/5">
                    Act I — Antiquity
                  </th>
                )}
                {act2.length > 0 && (
                  <th colSpan={act2.length} className="px-2 py-1 text-center text-body-xs text-muted uppercase tracking-wider border-b border-bone">
                    Act II — Current Day
                  </th>
                )}
              </tr>
              <tr className="bg-bone/20">
                <th className="sticky left-0 z-10 bg-bone/20 px-3 py-1.5 text-left text-body-xs text-ash border-b border-r border-bone">
                  &nbsp;
                </th>
                {[...act1, ...act2].map((scene) => (
                  <th key={scene.id} className="px-2 py-1.5 text-center border-b border-bone min-w-[100px]">
                    <span className="font-mono text-data-sm text-ink">
                      {scene.act}.{scene.scene_number}
                    </span>
                    {scene.title && (
                      <p className="text-[10px] text-muted font-normal truncate max-w-[90px]" title={scene.title}>
                        {scene.title}
                      </p>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cast.map((member) => (
                <tr key={member.person_id} className="hover:bg-brick/3 transition-colors">
                  <td className="sticky left-0 z-10 bg-paper px-3 py-2 border-b border-r border-bone">
                    <p className="text-body-sm font-medium text-ink truncate">{member.name}</p>
                    <p className="text-body-xs text-ash truncate">{member.role_title}</p>
                  </td>
                  {[...act1, ...act2].map((scene) => {
                    const key = `${member.person_id}-${scene.id}`;
                    const entry = entryMap.get(key);
                    const isEditing = editing === key;

                    if (isEditing) {
                      return (
                        <td key={scene.id} className="px-1 py-1 border-b border-bone align-top" colSpan={1}>
                          <form action={handleSave} className="space-y-1">
                            <input type="hidden" name="production_id" value={productionId} />
                            <input type="hidden" name="scene_id" value={scene.id} />
                            <input type="hidden" name="person_id" value={member.person_id} />
                            <input type="hidden" name="character_name" value={member.role_title.split(" / ")[scene.act === 1 ? 0 : 1] || member.role_title} />
                            <textarea
                              name="costume_description"
                              defaultValue={entry?.costume_description || ""}
                              placeholder="Costume..."
                              rows={2}
                              autoFocus
                              className="w-full px-1.5 py-1 bg-paper border border-brick/30 rounded text-[11px] text-ink focus:outline-none resize-none"
                            />
                            <input
                              name="change_notes"
                              defaultValue={entry?.change_notes || ""}
                              placeholder="Change notes"
                              className="w-full px-1.5 py-0.5 bg-paper border border-bone rounded text-[10px] text-ash focus:outline-none"
                            />
                            <select
                              name="status"
                              defaultValue={entry?.status || "planned"}
                              className="w-full px-1 py-0.5 bg-paper border border-bone rounded text-[10px] text-ash"
                            >
                              <option value="planned">Planned</option>
                              <option value="in_progress">In Progress</option>
                              <option value="fitted">Fitted</option>
                              <option value="ready">Ready</option>
                            </select>
                            <div className="flex gap-1">
                              <button type="submit" disabled={loading}
                                className="px-2 py-0.5 bg-ink text-paper text-[10px] rounded hover:bg-ink/90 disabled:opacity-50">
                                {loading ? "..." : "Save"}
                              </button>
                              <button type="button" onClick={() => setEditing(null)}
                                className="px-2 py-0.5 text-[10px] text-ash hover:text-ink">
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={scene.id}
                        onClick={() => setEditing(key)}
                        className={`px-1.5 py-1.5 border-b border-bone cursor-pointer align-top transition-colors hover:bg-brick/5 ${
                          entry ? statusColors[entry.status] || "" : ""
                        }`}
                      >
                        {entry ? (
                          <div>
                            <div className="flex items-start gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${statusDot[entry.status]}`} />
                              <p className="text-[11px] text-ink leading-tight">
                                {entry.costume_description || "—"}
                              </p>
                            </div>
                            {entry.change_notes && (
                              <p className="text-[9px] text-muted mt-0.5 leading-tight">
                                {entry.change_notes}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-bone">+</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-body-xs text-ash">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot.planned}`} /> Planned
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot.in_progress}`} /> In Progress
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot.fitted}`} /> Fitted
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot.ready}`} /> Ready
        </div>
      </div>
    </div>
  );
}
