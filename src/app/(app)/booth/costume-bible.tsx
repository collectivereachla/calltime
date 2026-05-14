"use client";

import { useState } from "react";
import { CostumePlot } from "./costume-plot";
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
        />
      )}

      {/* Costume Parade tab */}
      {tab === "parade" && (
        <div>
          <p className="text-body-xs text-ash mb-4">
            Parade order for costume approval. Each actor presents each look for review.
          </p>
          {paradeEntries.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-2">No parade entries yet.</p>
              <p className="text-body-xs text-muted">
                Populate the costume plot first, then generate the parade order from it.
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
                              Scenes: {entry.scenes}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-body-xs px-2 py-0.5 rounded-full shrink-0 ${approvalColors[entry.approval_status]}`}>
                        {entry.approval_status.replace(/_/g, " ")}
                      </span>
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
            Actor measurements for costume construction and pulling. Click any row to update.
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
                </tr>
              </thead>
              <tbody>
                {cast.map((member) => {
                  const m = measurementMap.get(member.person_id);
                  return (
                    <tr key={member.person_id} className="hover:bg-brick/3 transition-colors">
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
        <div>
          <p className="text-body-xs text-ash mb-4">
            Costume inventory from Google Drive. {inventoryItems.filter(i => !i.available).length > 0 &&
              `${inventoryItems.filter(i => !i.available).length} items assigned.`}
          </p>
          {inventoryItems.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No inventory items yet.</p>
            </div>
          ) : (() => {
            const categories = new Map<string, InventoryItem[]>();
            for (const item of inventoryItems) {
              if (!categories.has(item.category)) categories.set(item.category, []);
              categories.get(item.category)!.push(item);
            }
            const catLabels: Record<string, string> = {
              men: "Men", women: "Women", girls: "Girls", boys: "Boys",
              accessories: "Accessories", shoes: "Shoes", hats: "Hats", other: "Other"
            };
            return (
              <div className="space-y-6">
                {Array.from(categories.entries()).map(([cat, items]) => (
                  <div key={cat}>
                    <h3 className="text-body-xs text-muted uppercase tracking-wider mb-3">
                      {catLabels[cat] || cat} ({items.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {items.map((item) => {
                        const assignedPerson = item.assigned_to_person_id
                          ? cast.find(c => c.person_id === item.assigned_to_person_id)
                          : null;
                        return (
                          <div key={item.id} className={`bg-card border rounded-card overflow-hidden ${
                            item.available ? "border-bone" : "border-brick/30"
                          }`}>
                            {item.thumbnail_url && (
                              <div className="aspect-square bg-bone/20">
                                <img
                                  src={item.thumbnail_url}
                                  alt={item.item_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            )}
                            <div className="px-2.5 py-2">
                              <p className="text-body-xs font-medium text-ink truncate">{item.item_name}</p>
                              {item.size && (
                                <p className="font-mono text-[10px] text-ash">{item.size}</p>
                              )}
                              {assignedPerson && (
                                <p className="text-[10px] text-brick mt-0.5 truncate">
                                  → {assignedPerson.name}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
