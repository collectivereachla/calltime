"use client";

import { useState, useRef } from "react";
import {
  assignInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "./inventory-actions";
import { createClient } from "@/lib/supabase/client";
import { migrateCostumePhotos } from "./migrate-photos-actions";
import { useRouter } from "next/navigation";

interface InventoryItem {
  id: string; category: string; item_name: string; size: string | null;
  thumbnail_url: string | null; available: boolean; notes: string | null;
  assigned_to_person_id: string | null;
  owner_type: string; owner_name: string | null; owner_person_id: string | null;
  storage_location: string | null;
}

interface CastMember { person_id: string; name: string; role_title: string; }
interface OrgPerson { id: string; name: string; }

interface MeasurementEntry {
  id: string; person_id: string; fitting_status: string;
  height: string | null; chest_bust: string | null; waist: string | null;
  hip: string | null; inseam: string | null; shoe: string | null;
}

interface Props {
  items: InventoryItem[];
  cast: CastMember[];
  measurements: MeasurementEntry[];
  productionId: string;
  orgId: string;
  orgPeople: OrgPerson[];
  canManage: boolean;
}

type OwnerType = "house" | "individual" | "external";

const catLabels: Record<string, string> = {
  men: "Men", women: "Women", girls: "Girls", boys: "Boys",
  accessories: "Accessories", shoes: "Shoes", hats: "Hats", other: "Other",
};
const CATEGORY_KEYS = ["men", "women", "girls", "boys", "accessories", "shoes", "hats", "other"];

interface FormState {
  itemName: string; category: string; size: string; notes: string;
  ownerType: OwnerType; ownerName: string; ownerPersonId: string;
  storageLocation: string;
  thumbnailUrl: string | null;
}

const EMPTY_FORM: FormState = {
  itemName: "", category: "men", size: "", notes: "",
  ownerType: "house", ownerName: "", ownerPersonId: "",
  storageLocation: "", thumbnailUrl: null,
};

function compressImage(file: Blob, maxDim = 1400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim && file.size < 2 * 1024 * 1024) {
        resolve(file);
        return;
      }
      if (width > height) {
        if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("fail"))), "image/jpeg", 0.85);
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
  });
}

function ownerLabel(item: InventoryItem): string {
  if (item.owner_type === "house") return "Creative Reach";
  return item.owner_name || (item.owner_type === "external" ? "External" : "Individual");
}

export function InventoryTab({ items, cast, measurements, productionId, orgId, orgPeople, canManage }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | OwnerType>("all");

  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const measurementMap = new Map<string, MeasurementEntry>();
  for (const m of measurements) measurementMap.set(m.person_id, m);

  async function handleAssign(itemId: string, personId: string) {
    setLoading(itemId); setAssignError(null);
    const result = await assignInventoryItem(itemId, personId || null, personId ? productionId : null);
    setLoading(null);
    if (result?.error) { setAssignError(result.error); return; }
    router.refresh();
  }

  function openCreate() {
    setForm(EMPTY_FORM); setEditingId(null); setFormError(null); setModalOpen(true);
  }
  function openEdit(item: InventoryItem) {
    setForm({
      itemName: item.item_name, category: item.category, size: item.size || "",
      notes: item.notes || "",
      ownerType: (["house", "individual", "external"].includes(item.owner_type) ? item.owner_type : "house") as OwnerType,
      ownerName: item.owner_name || "",
      ownerPersonId: item.owner_person_id || "",
      storageLocation: item.storage_location || "",
      thumbnailUrl: item.thumbnail_url,
    });
    setEditingId(item.id); setFormError(null); setModalOpen(true);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFormError("Please choose an image file."); return; }
    setUploading(true); setFormError(null);
    try {
      const blob = await compressImage(file);
      const supabase = createClient();
      const path = `${orgId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("costume-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) { setFormError(upErr.message); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from("costume-photos").getPublicUrl(path);
      setForm((f) => ({ ...f, thumbnailUrl: urlData.publicUrl }));
    } catch {
      setFormError("Couldn't process that image. Try another.");
    }
    setUploading(false);
  }

  async function handleSave() {
    if (!form.itemName.trim()) { setFormError("Item name is required."); return; }
    setSaving(true); setFormError(null);
    const payload = {
      itemName: form.itemName, category: form.category,
      size: form.size, notes: form.notes,
      ownerType: form.ownerType,
      ownerName: form.ownerName, ownerPersonId: form.ownerPersonId,
      storageLocation: form.storageLocation,
      thumbnailUrl: form.thumbnailUrl,
    };
    const result = editingId
      ? await updateInventoryItem(editingId, payload)
      : await createInventoryItem(orgId, payload);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm("Delete this item? This removes it from inventory and any assignment.")) return;
    setSaving(true); setFormError(null);
    const result = await deleteInventoryItem(editingId);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  async function handleMigrate() {
    const total = items.filter((i) => i.thumbnail_url?.includes("drive.google.com")).length;
    setMigrating(true);
    setMigrateMsg(`Moving ${total} photos into Calltime…`);
    let done = 0;
    while (true) {
      const r = await migrateCostumePhotos(orgId, 6);
      if (r.error) { setMigrateMsg(`Error: ${r.error}`); break; }
      done += r.migrated;
      if (r.remaining === 0) { setMigrateMsg(`Done — ${done} photo${done === 1 ? "" : "s"} now stored in Calltime.`); break; }
      if (r.migrated === 0) {
        setMigrateMsg(`Stopped — ${r.remaining} photo${r.remaining === 1 ? "" : "s"} couldn't be fetched from Drive (they still display from Drive). You can retry.`);
        break;
      }
      setMigrateMsg(`Moved ${done} of ${total}…`);
    }
    setMigrating(false);
    router.refresh();
  }

  // Owner picker select value for the "individual" case
  const individualSelectValue = form.ownerPersonId
    ? form.ownerPersonId
    : form.ownerName ? "__other__" : "";

  const driveCount = items.filter((i) => i.thumbnail_url?.includes("drive.google.com")).length;

  const filtered = filter === "all" ? items : items.filter((i) => (i.owner_type || "house") === filter);
  const assigned = items.filter((i) => i.assigned_to_person_id);

  const categories = new Map<string, InventoryItem[]>();
  for (const item of filtered) {
    if (!categories.has(item.category)) categories.set(item.category, []);
    categories.get(item.category)!.push(item);
  }

  const ownerFilters: { key: "all" | OwnerType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "house", label: "Creative Reach" },
    { key: "individual", label: "Individuals" },
    { key: "external", label: "External" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-body-xs text-ash">
          {items.length} item{items.length === 1 ? "" : "s"}.
          {assigned.length > 0 && ` ${assigned.length} assigned.`}
          <span className="text-muted"> Assign items to actors with the dropdown on each card.</span>
        </p>
        {canManage && (
          <button
            onClick={openCreate}
            className="shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card bg-brick text-paper hover:bg-brick/90 transition-colors"
          >
            + Add item
          </button>
        )}
      </div>

      {canManage && (driveCount > 0 || migrating || migrateMsg) && (
        <div className="mb-4 bg-tentative/10 border border-tentative/30 rounded-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-body-xs text-ink">
            {migrateMsg ? (
              migrateMsg
            ) : (
              <>
                <span className="font-medium">{driveCount} photo{driveCount === 1 ? "" : "s"}</span> still load from Google Drive.
                <span className="text-muted"> Move them into Calltime so Drive can be retired.</span>
              </>
            )}
          </div>
          {driveCount > 0 && (
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {migrating ? "Moving…" : "Move into Calltime"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-5">
        {ownerFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
              filter === f.key
                ? "border-brick bg-brick/10 text-brick"
                : "border-bone text-ash hover:border-ash/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {assignError && (
        <div className="mb-4 bg-conflict/10 border border-conflict/30 rounded-card px-4 py-3">
          <p className="text-body-xs text-conflict">{assignError}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">
            {items.length === 0 ? "No inventory items yet." : "No items match this filter."}
          </p>
          {canManage && items.length === 0 && (
            <p className="text-body-xs text-muted mt-1">Use “Add item” to photograph and catalog a piece.</p>
          )}
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
                    ? cast.find((c) => c.person_id === item.assigned_to_person_id)
                    : null;
                  const isLoading = loading === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`bg-card border rounded-card overflow-hidden transition-colors relative ${
                        item.assigned_to_person_id ? "border-brick/30" : "border-bone"
                      }`}
                    >
                      {item.thumbnail_url ? (
                        <div className="aspect-square bg-bone/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.thumbnail_url} alt={item.item_name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="aspect-square bg-bone/20 flex items-center justify-center">
                          <span className="text-ash opacity-30 text-lg">◨</span>
                        </div>
                      )}
                      {canManage && (
                        <button
                          onClick={() => openEdit(item)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-paper/85 border border-bone text-ash hover:text-brick hover:border-brick flex items-center justify-center text-[11px] transition-colors"
                          title="Edit item"
                        >
                          ✎
                        </button>
                      )}
                      <div className="px-2.5 py-2">
                        <p className="text-body-xs font-medium text-ink truncate">{item.item_name}</p>
                        {item.size && <p className="font-mono text-[10px] text-ash">{item.size}</p>}
                        {item.storage_location && (
                          <p className="text-[10px] text-muted truncate">📍 {item.storage_location}</p>
                        )}
                        <p
                          className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                            item.owner_type === "house"
                              ? "bg-ash/10 text-ash"
                              : item.owner_type === "external"
                              ? "bg-tentative/15 text-tentative"
                              : "bg-brick/10 text-brick"
                          }`}
                          title="Owner"
                        >
                          {ownerLabel(item)}
                        </p>
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
                        {assignedPerson && (() => {
                          const m = measurementMap.get(assignedPerson.person_id);
                          if (!m) return null;
                          const dims = [m.chest_bust && `Ch ${m.chest_bust}`, m.waist && `W ${m.waist}`, m.hip && `H ${m.hip}`, m.shoe && `Sh ${m.shoe}`].filter(Boolean);
                          if (dims.length === 0) return null;
                          return <p className="text-[9px] text-muted mt-1 font-mono leading-tight">{dims.join(" · ")}</p>;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/50 p-0 md:p-4" onClick={() => !saving && setModalOpen(false)}>
          <div
            className="bg-paper w-full md:max-w-md rounded-t-card md:rounded-card border border-bone max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-bone flex items-center justify-between sticky top-0 bg-paper">
              <h3 className="font-display text-body-lg text-ink">{editingId ? "Edit item" : "Add item"}</h3>
              <button onClick={() => !saving && setModalOpen(false)} className="text-ash hover:text-ink text-lg leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Photo */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-20 h-20 rounded-card overflow-hidden border-2 border-dashed border-bone hover:border-brick transition-colors shrink-0 relative"
                >
                  {form.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-brick/5 flex items-center justify-center">
                      <span className="text-brick text-body-lg">+</span>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-paper/70 flex items-center justify-center">
                      <span className="text-[10px] text-ash">…</span>
                    </div>
                  )}
                </button>
                <div className="text-body-xs text-muted">
                  {form.thumbnailUrl ? "Tap to replace photo" : "Tap to take or upload a photo"}
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
              </div>

              <div>
                <label className="text-body-xs text-muted block mb-1">Item name</label>
                <input
                  value={form.itemName}
                  onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
                  placeholder="e.g. Vest, Dress Shirt"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body-xs text-muted block mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                  >
                    {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{catLabels[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-body-xs text-muted block mb-1">Size</label>
                  <input
                    value={form.size}
                    onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                    placeholder="e.g. XL, 34/32"
                    className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                  />
                </div>
              </div>

              {/* Owner */}
              <div>
                <label className="text-body-xs text-muted block mb-1">Owner</label>
                <select
                  value={form.ownerType}
                  onChange={(e) => {
                    const t = e.target.value as OwnerType;
                    setForm((f) => ({ ...f, ownerType: t, ownerName: "", ownerPersonId: "" }));
                  }}
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                >
                  <option value="house">Creative Reach (house stock)</option>
                  <option value="individual">An individual (cast or staff)</option>
                  <option value="external">An external org (e.g. BTE)</option>
                </select>
              </div>

              {form.ownerType === "individual" && (
                <div className="space-y-2">
                  <select
                    value={individualSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__other__") {
                        setForm((f) => ({ ...f, ownerPersonId: "", ownerName: "" }));
                      } else if (v === "") {
                        setForm((f) => ({ ...f, ownerPersonId: "", ownerName: "" }));
                      } else {
                        const p = orgPeople.find((op) => op.id === v);
                        setForm((f) => ({ ...f, ownerPersonId: v, ownerName: p?.name || "" }));
                      }
                    }}
                    className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                  >
                    <option value="">Select a person…</option>
                    {orgPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__other__">Someone not listed…</option>
                  </select>
                  {individualSelectValue === "__other__" && (
                    <input
                      value={form.ownerName}
                      onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                      placeholder="Owner's name"
                      className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                    />
                  )}
                </div>
              )}

              {form.ownerType === "external" && (
                <input
                  value={form.ownerName}
                  onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                  placeholder="Organization name (e.g. BTE)"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              )}

              <div>
                <label className="text-body-xs text-muted block mb-1">Storage location</label>
                <input
                  value={form.storageLocation}
                  onChange={(e) => setForm((f) => ({ ...f, storageLocation: e.target.value }))}
                  placeholder="e.g. Wardrobe rack B, Bin 3"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>

              <div>
                <label className="text-body-xs text-muted block mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Condition, alterations, where it lives…"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick resize-none"
                />
              </div>

              {formError && <p className="text-body-xs text-conflict">{formError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-bone flex items-center justify-between gap-3 sticky bottom-0 bg-paper">
              {editingId ? (
                <button onClick={handleDelete} disabled={saving} className="text-body-xs text-conflict hover:underline disabled:opacity-50">
                  Delete
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-2 text-body-sm text-ash hover:text-ink disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || uploading} className="px-4 py-2 text-body-sm font-medium rounded-card bg-brick text-paper hover:bg-brick/90 disabled:opacity-50">
                  {saving ? "Saving…" : editingId ? "Save" : "Add item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
