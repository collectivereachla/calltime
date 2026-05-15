"use client";

import { useState } from "react";
import { assignInventoryItem } from "./inventory-actions";
import { useRouter } from "next/navigation";

interface InventoryItem {
  id: string; category: string; item_name: string; size: string | null;
  thumbnail_url: string | null; available: boolean; notes: string | null;
  assigned_to_person_id: string | null;
}

interface CastMember {
  person_id: string; name: string; role_title: string;
}

interface Props {
  items: InventoryItem[];
  cast: CastMember[];
  productionId: string;
}

const catLabels: Record<string, string> = {
  men: "Men", women: "Women", girls: "Girls", boys: "Boys",
  accessories: "Accessories", shoes: "Shoes", hats: "Hats", other: "Other"
};

export function InventoryTab({ items, cast, productionId }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function handleAssign(itemId: string, personId: string) {
    setLoading(itemId);
    await assignInventoryItem(
      itemId,
      personId || null,
      personId ? productionId : null
    );
    setLoading(null);
    router.refresh();
  }

  const categories = new Map<string, InventoryItem[]>();
  for (const item of items) {
    if (!categories.has(item.category)) categories.set(item.category, []);
    categories.get(item.category)!.push(item);
  }

  const assigned = items.filter(i => i.assigned_to_person_id);

  return (
    <div>
      <p className="text-body-xs text-ash mb-4">
        Costume inventory from Google Drive. {assigned.length > 0 && `${assigned.length} items assigned.`}
        <span className="text-muted"> Assign items to actors using the dropdown on each card.</span>
      </p>

      {items.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">No inventory items yet.</p>
          <p className="text-body-xs text-muted mt-1">Add photos to the Google Drive Costume Inventory folder, then ask to sync.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(categories.entries()).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="text-body-xs text-muted uppercase tracking-wider mb-3">
                {catLabels[cat] || cat} ({catItems.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {catItems.map((item) => {
                  const assignedPerson = item.assigned_to_person_id
                    ? cast.find(c => c.person_id === item.assigned_to_person_id)
                    : null;
                  const isLoading = loading === item.id;

                  return (
                    <div key={item.id} className={`bg-card border rounded-card overflow-hidden transition-colors ${
                      item.assigned_to_person_id ? "border-brick/30" : "border-bone"
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
                        <select
                          value={item.assigned_to_person_id || ""}
                          onChange={(e) => handleAssign(item.id, e.target.value)}
                          disabled={isLoading}
                          className={`w-full mt-1.5 px-1.5 py-1 text-[11px] rounded border transition-colors ${
                            item.assigned_to_person_id
                              ? "border-brick/20 bg-brick/5 text-brick"
                              : "border-bone bg-paper text-ash"
                          } focus:outline-none focus:border-brick disabled:opacity-50`}
                        >
                          <option value="">Unassigned</option>
                          {cast.map((c) => (
                            <option key={c.person_id} value={c.person_id}>
                              {c.name} — {c.role_title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
