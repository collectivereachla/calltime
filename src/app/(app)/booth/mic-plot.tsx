"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMic, updateMic, deleteMic, setMicAssignees } from "./mic-actions";

interface MicItem {
  id: string; pack_number: string; channel: string | null;
  element: string | null; is_backup: boolean; notes: string | null;
  assignedPersonIds: string[];
}
interface CastMember { person_id: string; name: string; role_title: string; }

interface Props {
  productionId: string;
  mics: MicItem[];
  cast: CastMember[];
  canManage: boolean;
}

interface FormState {
  packNumber: string; channel: string; element: string; isBackup: boolean; notes: string;
}
const EMPTY: FormState = { packNumber: "", channel: "", element: "", isBackup: false, notes: "" };

function micSort(a: MicItem, b: MicItem) {
  const na = parseInt(a.pack_number, 10);
  const nb = parseInt(b.pack_number, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.pack_number.localeCompare(b.pack_number);
}

export function MicPlot({ productionId, mics, cast, canManage }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);

  const sorted = [...mics].sort(micSort);
  const assignedCount = new Set(mics.flatMap((m) => m.assignedPersonIds)).size;

  function openCreate() { setForm(EMPTY); setEditingId(null); setFormError(null); setModalOpen(true); }
  function openEdit(m: MicItem) {
    setForm({
      packNumber: m.pack_number, channel: m.channel || "", element: m.element || "",
      isBackup: m.is_backup, notes: m.notes || "",
    });
    setEditingId(m.id); setFormError(null); setModalOpen(true);
  }

  async function handleSave() {
    if (!form.packNumber.trim()) { setFormError("A pack number or label is required."); return; }
    setSaving(true); setFormError(null);
    const payload = {
      packNumber: form.packNumber, channel: form.channel, element: form.element,
      isBackup: form.isBackup, notes: form.notes,
    };
    const result = editingId
      ? await updateMic(editingId, payload)
      : await createMic(productionId, payload);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  async function handleDelete() {
    if (!editingId) return;
    setSaving(true); setFormError(null);
    const result = await deleteMic(editingId);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  async function toggleAssignee(mic: MicItem, personId: string) {
    const has = mic.assignedPersonIds.includes(personId);
    const next = has
      ? mic.assignedPersonIds.filter((id) => id !== personId)
      : [...mic.assignedPersonIds, personId];
    setLoading(mic.id); setAssignError(null);
    const result = await setMicAssignees(mic.id, productionId, next);
    setLoading(null);
    if (result?.error) { setAssignError(result.error); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-body-sm font-medium text-ink">Wireless mics</h3>
          <p className="text-body-xs text-muted">
            {mics.length} pack{mics.length === 1 ? "" : "s"} · {assignedCount} actor{assignedCount === 1 ? "" : "s"} on mics.
            {" "}Assign each pack to the actor(s) who share it.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors"
          >
            + Add mic
          </button>
        )}
      </div>

      {assignError && <p className="text-body-xs text-brick mb-2">{assignError}</p>}

      {mics.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-4 py-6 text-center">
          <p className="text-body-sm text-ash">No mics yet.</p>
          {canManage && <p className="text-body-xs text-muted mt-1">Add your rack packs, then assign each to an actor.</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((m) => {
            const names = m.assignedPersonIds
              .map((pid) => cast.find((c) => c.person_id === pid)?.name)
              .filter(Boolean) as string[];
            const panelOpen = assignOpen === m.id;
            const isLoading = loading === m.id;
            return (
              <div key={m.id} className="bg-card border border-bone rounded-card px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-card bg-ink/5 border border-bone flex items-center justify-center">
                    <span className="font-mono text-body-sm font-semibold text-ink">{m.pack_number}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.element && <span className="text-body-xs text-ink truncate">{m.element}</span>}
                      {m.channel && <span className="font-mono text-[10px] text-ash">ch {m.channel}</span>}
                      {m.is_backup && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-tentative/15 text-tentative">Backup</span>}
                    </div>
                    {m.notes && <p className="text-[10px] text-muted truncate">{m.notes}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => { if (canManage) setAssignOpen(panelOpen ? null : m.id); }}
                      disabled={!canManage}
                      className={`px-2 py-1 text-[11px] rounded border max-w-[180px] truncate transition-colors ${
                        names.length > 0 ? "border-brick/20 bg-brick/5 text-brick" : "border-bone bg-paper text-ash"
                      } ${canManage ? "hover:border-brick cursor-pointer" : "cursor-default"}`}
                    >
                      {names.length > 0 ? names.join(", ") : "Unassigned"}
                      {canManage && <span className="ml-1 opacity-60">{panelOpen ? "▴" : "▾"}</span>}
                    </button>
                    {canManage && (
                      <button
                        onClick={() => openEdit(m)}
                        className="w-7 h-7 rounded-full border border-bone text-ash hover:text-brick hover:border-brick flex items-center justify-center text-[11px] transition-colors"
                        title="Edit mic"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                </div>

                {panelOpen && canManage && (
                  <div className="mt-2 border border-bone rounded p-1.5 bg-paper max-h-48 overflow-y-auto space-y-0.5">
                    {cast.length === 0 && <p className="text-[10px] text-muted px-1 py-0.5">No cast on this production yet.</p>}
                    {cast.map((c) => {
                      const checked = m.assignedPersonIds.includes(c.person_id);
                      return (
                        <button
                          key={c.person_id}
                          onClick={() => toggleAssignee(m, c.person_id)}
                          disabled={isLoading}
                          className="w-full flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-left rounded hover:bg-bone/40 disabled:opacity-50"
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 rounded-sm border flex items-center justify-center text-[8px] ${checked ? "bg-brick border-brick text-paper" : "border-ash/40"}`}>
                            {checked ? "✓" : ""}
                          </span>
                          <span className="truncate">{c.name} <span className="text-muted">— {c.role_title}</span></span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setModalOpen(false)}>
          <div className="bg-paper rounded-card border border-bone w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-body-md font-medium text-ink">{editingId ? "Edit mic" : "Add mic"}</h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-body-xs text-muted block mb-1">Pack # / label</label>
                <input
                  value={form.packNumber}
                  onChange={(e) => setForm((f) => ({ ...f, packNumber: e.target.value }))}
                  placeholder="e.g. 7"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>
              <div>
                <label className="text-body-xs text-muted block mb-1">Channel / freq</label>
                <input
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                  placeholder="optional"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>
            </div>

            <div>
              <label className="text-body-xs text-muted block mb-1">Element / color</label>
              <input
                value={form.element}
                onChange={(e) => setForm((f) => ({ ...f, element: e.target.value }))}
                placeholder="e.g. Countryman B3, tan"
                className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
              />
            </div>

            <label className="flex items-center gap-2 text-body-sm text-ink">
              <input
                type="checkbox"
                checked={form.isBackup}
                onChange={(e) => setForm((f) => ({ ...f, isBackup: e.target.checked }))}
                className="accent-brick"
              />
              Backup / spare pack
            </label>

            <div>
              <label className="text-body-xs text-muted block mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="optional"
                className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
              />
            </div>

            {formError && <p className="text-body-xs text-brick">{formError}</p>}

            <div className="flex items-center justify-between gap-2 pt-1">
              {editingId ? (
                <button onClick={handleDelete} disabled={saving} className="text-body-xs text-ash hover:text-brick disabled:opacity-50">Delete</button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink disabled:opacity-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
                  {saving ? "Saving…" : editingId ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
