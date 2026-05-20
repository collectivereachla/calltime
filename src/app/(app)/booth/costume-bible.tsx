"use client";

import { useState } from "react";
import { CostumePlot } from "./costume-plot";
import { InventoryTab } from "./inventory-tab";
import { saveMeasurement, generateParade, updateParadeStatus } from "./actions";
import { useRouter } from "next/navigation";

interface Scene {
  id: string; act: number; scene_number: number; title: string | null;
}

interface CastMember {
  person_id: string; name: string; role_title: string;
  email: string | null; phone: string | null;
}

interface CostumeEntry {
  scene_id: string; person_id: string; character_name: string;
  costume_description: string | null; change_notes: string | null;
  change_location: string | null; status: string; image_url: string | null;
}

interface ParadeEntry {
  id: string; person_id: string; parade_order: number; character_name: string;
  look_name: string | null; scenes: string | null; pieces_to_present: string | null;
  hair_makeup: string | null; notes: string | null; approval_status: string;
  priority: string;
}

interface MeasurementEntry {
  id: string; person_id: string; fitting_status: string;
  height: string | null; chest_bust: string | null; waist: string | null;
  hip: string | null; inseam: string | null; shoe: string | null;
  notes: string | null;
}

interface InventoryItem {
  id: string; category: string; item_name: string; size: string | null;
  thumbnail_url: string | null; available: boolean; notes: string | null;
  assigned_to_person_id: string | null;
}

interface Props {
  productionId: string;
  scenes: Scene[];
  cast: CastMember[];
  costumeEntries: CostumeEntry[];
  paradeEntries: ParadeEntry[];
  measurementEntries: MeasurementEntry[];
  inventoryItems: InventoryItem[];
  canManage: boolean;
}

const approvalColors: Record<string, string> = {
  not_reviewed: "bg-ash/10 text-ash",
  approved: "bg-confirmed/10 text-confirmed",
  needs_fixes: "bg-tentative/10 text-tentative",
  cut: "bg-conflict/10 text-conflict",
};

const fittingColors: Record<string, string> = {
  not_scheduled: "bg-ash/10 text-ash",
  scheduled: "bg-tentative/10 text-tentative",
  completed: "bg-confirmed/10 text-confirmed",
  needs_refit: "bg-brick/10 text-brick",
};

export function CostumeBible({ productionId, scenes, cast, costumeEntries, paradeEntries, measurementEntries, inventoryItems, canManage }: Props) {
  const [tab, setTab] = useState<"plot" | "parade" | "measurements" | "inventory">("plot");
  const [editingMeasurement, setEditingMeasurement] = useState<string | null>(null);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [generatingParade, setGeneratingParade] = useState(false);
  const router = useRouter();

  const tabs = [
    { key: "plot" as const, label: "Costume Plot", count: costumeEntries.length },
    { key: "parade" as const, label: "Parade", count: paradeEntries.length },
    { key: "measurements" as const, label: "Measurements", count: measurementEntries.filter(m => m.fitting_status === "completed").length + "/" + cast.length },
    { key: "inventory" as const, label: "Inventory", count: inventoryItems.length },
  ];

  // Build measurement lookup
  const measurementMap = new Map<string, MeasurementEntry>();
  for (const m of measurementEntries) {
    measurementMap.set(m.person_id, m);
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-body-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-ink text-paper"
                : "text-ash hover:text-ink border border-bone"
            }`}
          >
            {t.label}
            <span className="ml-1.5 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Costume Plot tab */}
      {tab === "plot" && (
        <CostumePlot
          productionId={productionId}
          scenes={scenes}
          cast={cast}
          entries={costumeEntries}
          inventoryItems={inventoryItems}
        />
      )}

      {/* Costume Parade tab */}
      {tab === "parade" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-body-xs text-ash">
              Parade order for costume approval. Each actor presents each look for review.
            </p>
            {canManage && costumeEntries.length > 0 && (
              <button
                onClick={async () => {
                  setGeneratingParade(true);
                  await generateParade(productionId);
                  setGeneratingParade(false);
                  router.refresh();
                }}
                disabled={generatingParade}
                className="px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {generatingParade ? "Generating..." : paradeEntries.length > 0 ? "Regenerate from plot" : "Generate from plot"}
              </button>
            )}
          </div>
          {paradeEntries.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-2">No parade entries yet.</p>
              <p className="text-body-xs text-muted">
                {costumeEntries.length > 0
                  ? "Tap \"Generate from plot\" to create the parade order from your costume plot."
                  : "Fill in the costume plot first, then generate the parade order from it."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {paradeEntries.sort((a, b) => a.parade_order - b.parade_order).map((entry) => {
                const person = cast.find(c => c.person_id === entry.person_id);
                return (
                  <div key={entry.id} className="bg-card border border-bone rounded-card px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="font-mono text-data-sm text-ash w-6 text-right shrink-0 mt-0.5">
                          {entry.parade_order}
                        </span>
                        <div>
                          <p className="text-body-sm font-medium text-ink">
                            {person?.name || "Unknown"} — <span className="text-ash">{entry.character_name}</span>
                          </p>
                          {entry.look_name && (
                            <p className="text-body-xs text-ash mt-0.5">{entry.look_name}</p>
                          )}
                          {entry.pieces_to_present && (
                            <p className="text-body-xs text-muted mt-1">{entry.pieces_to_present}</p>
                          )}
                          {entry.scenes && (
                            <span className="inline-block text-[10px] text-muted mt-1 font-mono">
                              {entry.scenes}
                            </span>
                          )}
                        </div>
                      </div>
                      {canManage ? (
                        <select
                          value={entry.approval_status}
                          onChange={async (e) => {
                            await updateParadeStatus(entry.id, e.target.value);
                            router.refresh();
                          }}
                          className={`text-body-xs px-2 py-1 rounded-full shrink-0 border-0 cursor-pointer ${approvalColors[entry.approval_status]}`}
                        >
                          <option value="not_reviewed">not reviewed</option>
                          <option value="approved">approved</option>
                          <option value="needs_fixes">needs fixes</option>
                          <option value="cut">cut</option>
                        </select>
                      ) : (
                        <span className={`text-body-xs px-2 py-0.5 rounded-full shrink-0 ${approvalColors[entry.approval_status]}`}>
                          {entry.approval_status.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Measurements tab */}
      {tab === "measurements" && (
        <div>
          <p className="text-body-xs text-ash mb-4">
            Actor measurements for costume construction and pulling. Tap any row to edit.
          </p>
          <div className="overflow-x-auto border border-bone rounded-card">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-bone/20">
                  <th className="sticky left-0 z-10 bg-bone/20 px-3 py-2 text-left text-body-xs text-muted uppercase tracking-wider border-b border-bone w-40">Actor</th>
                  <th className="px-2 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Status</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Height</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Chest</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Waist</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Hip</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Inseam</th>
                  <th className="px-2 py-2 text-center text-body-xs text-muted uppercase border-b border-bone">Shoe</th>
                  <th className="px-2 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Notes</th>
                  <th className="px-2 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Pulled</th>
                </tr>
              </thead>
              <tbody>
                {cast.map((member) => {
                  const m = measurementMap.get(member.person_id);
                  const isEditing = editingMeasurement === member.person_id;

                  if (isEditing) {
                    const cellInput = "w-full px-1.5 py-1 bg-paper border border-bone rounded text-body-xs text-ink font-mono focus:outline-none focus:border-brick text-center";
                    return (
                      <tr key={member.person_id} className="bg-brick/3">
                        <td className="sticky left-0 z-10 bg-brick/3 px-3 py-2 border-b border-bone">
                          <p className="text-body-sm font-medium text-ink">{member.name}</p>
                          <p className="text-body-xs text-ash">{member.role_title}</p>
                        </td>
                        <td className="px-2 py-2 border-b border-bone">
                          <select name="fitting_status" form={`mform-${member.person_id}`} defaultValue={m?.fitting_status || "not_scheduled"} className="px-1.5 py-1 bg-paper border border-bone rounded text-body-xs text-ink focus:outline-none focus:border-brick">
                            <option value="not_scheduled">Not scheduled</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="needs_refit">Needs refit</option>
                          </select>
                        </td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="height" defaultValue={m?.height || ""} placeholder={"5'6\""} className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="chest_bust" defaultValue={m?.chest_bust || ""} placeholder={'36"'} className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="waist" defaultValue={m?.waist || ""} placeholder={'30"'} className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="hip" defaultValue={m?.hip || ""} placeholder={'38"'} className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="inseam" defaultValue={m?.inseam || ""} placeholder={'30"'} className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone"><input form={`mform-${member.person_id}`} name="shoe" defaultValue={m?.shoe || ""} placeholder="10" className={cellInput} /></td>
                        <td className="px-1 py-1 border-b border-bone">
                          <input form={`mform-${member.person_id}`} name="notes" defaultValue={m?.notes || ""} placeholder="Notes" className="w-full px-1.5 py-1 bg-paper border border-bone rounded text-body-xs text-ink focus:outline-none focus:border-brick" />
                          <form id={`mform-${member.person_id}`} action={async (fd: FormData) => {
                            fd.set("production_id", productionId);
                            fd.set("person_id", member.person_id);
                            setSavingMeasurement(true);
                            await saveMeasurement(fd);
                            setSavingMeasurement(false);
                            setEditingMeasurement(null);
                            router.refresh();
                          }}>
                            <div className="flex gap-1 mt-1">
                              <button type="submit" disabled={savingMeasurement} className="px-2 py-0.5 bg-ink text-paper text-[10px] rounded hover:bg-ink/90 disabled:opacity-50">
                                {savingMeasurement ? "..." : "Save"}
                              </button>
                              <button type="button" onClick={() => setEditingMeasurement(null)} className="px-2 py-0.5 text-[10px] text-ash hover:text-ink">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={member.person_id} onClick={() => setEditingMeasurement(member.person_id)} className="hover:bg-brick/3 transition-colors cursor-pointer">
                      <td className="sticky left-0 z-10 bg-paper px-3 py-2 border-b border-bone">
                        <p className="text-body-sm font-medium text-ink">{member.name}</p>
                        <p className="text-body-xs text-ash">{member.role_title}</p>
                      </td>
                      <td className="px-2 py-2 border-b border-bone">
                        <span className={`text-body-xs px-1.5 py-0.5 rounded ${fittingColors[m?.fitting_status || "not_scheduled"]}`}>
                          {(m?.fitting_status || "not scheduled").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.height || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.chest_bust || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.waist || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.hip || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.inseam || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-center font-mono text-data-sm text-ink">{m?.shoe || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-body-xs text-muted max-w-[150px] truncate">{m?.notes || "—"}</td>
                      <td className="px-2 py-2 border-b border-bone text-body-xs text-ash max-w-[180px]">
                        {(() => {
                          const items = inventoryItems.filter(i => i.assigned_to_person_id === member.person_id);
                          if (items.length === 0) return <span className="text-muted">—</span>;
                          return items.map(i => (
                            <span key={i.id} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-brick/8 text-[10px] text-brick">
                              {i.item_name}{i.size ? ` (${i.size})` : ""}
                            </span>
                          ));
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Inventory tab */}
      {tab === "inventory" && (
        <InventoryTab items={inventoryItems} cast={cast} measurements={measurementEntries} productionId={productionId} />
      )}
    </div>
  );
}
