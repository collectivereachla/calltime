"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSoundOutput, updateSoundOutput, deleteSoundOutput } from "./sound-output-actions";

interface OutputItem {
  id: string; output_number: string; destination: string | null;
  source: string | null; connection: string; output_type: string;
  is_backup: boolean; notes: string | null;
}

interface Props {
  productionId: string;
  outputs: OutputItem[];
  canManage: boolean;
}

interface FormState {
  outputNumber: string; destination: string; source: string;
  connection: string; outputType: string; isBackup: boolean; notes: string;
}
const EMPTY: FormState = {
  outputNumber: "", destination: "", source: "",
  connection: "wired", outputType: "wedge", isBackup: false, notes: "",
};

const GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "speakers", label: "PA / speakers", types: ["speaker"] },
  { key: "monitors", label: "Wedges & monitors", types: ["wedge"] },
  { key: "iems", label: "IEMs", types: ["iem"] },
  { key: "feeds", label: "Feeds", types: ["feed"] },
  { key: "other", label: "Other outputs", types: ["other"] },
];

const TYPE_LABEL: Record<string, string> = {
  speaker: "Speaker", wedge: "Wedge", iem: "IEM", feed: "Feed", other: "Other",
};

function outputSort(a: OutputItem, b: OutputItem) {
  // Read the first number anywhere in the label, so "Mix 2" sorts before "Mix 10".
  const ma = a.output_number.match(/\d+/);
  const mb = b.output_number.match(/\d+/);
  const na = ma ? parseInt(ma[0], 10) : NaN;
  const nb = mb ? parseInt(mb[0], 10) : NaN;
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.output_number.localeCompare(b.output_number);
}

export function SoundOutputs({ productionId, outputs, canManage }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() { setForm(EMPTY); setEditingId(null); setFormError(null); setModalOpen(true); }
  function openEdit(o: OutputItem) {
    setForm({
      outputNumber: o.output_number, destination: o.destination || "", source: o.source || "",
      connection: o.connection || "wired", outputType: o.output_type || "wedge",
      isBackup: o.is_backup, notes: o.notes || "",
    });
    setEditingId(o.id); setFormError(null); setModalOpen(true);
  }

  async function handleSave() {
    if (!form.outputNumber.trim()) { setFormError("An output number or label is required."); return; }
    setSaving(true); setFormError(null);
    const payload = {
      outputNumber: form.outputNumber, destination: form.destination, source: form.source,
      connection: form.connection, outputType: form.outputType, isBackup: form.isBackup, notes: form.notes,
    };
    const result = editingId ? await updateSoundOutput(editingId, payload) : await createSoundOutput(productionId, payload);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  async function handleDelete() {
    if (!editingId) return;
    setSaving(true); setFormError(null);
    const result = await deleteSoundOutput(editingId);
    setSaving(false);
    if (result?.error) { setFormError(result.error); return; }
    setModalOpen(false); router.refresh();
  }

  function renderRow(o: OutputItem) {
    return (
      <div key={o.id} className="bg-card border border-bone rounded-card px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="shrink-0 min-w-9 h-9 px-2 rounded-card bg-ink/5 border border-bone flex items-center justify-center">
            <span className="font-mono text-body-sm font-semibold text-ink">{o.output_number}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {o.destination && <span className="text-body-xs text-ink truncate">{o.destination}</span>}
              {o.source && <span className="font-mono text-[10px] text-ash">from {o.source}</span>}
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-ash/10 text-ash">{TYPE_LABEL[o.output_type] || o.output_type}</span>
              {o.connection === "wireless" && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-ink/10 text-ink">Wireless</span>}
              {o.is_backup && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-tentative/15 text-tentative">Backup</span>}
            </div>
            {o.notes && <p className="text-[10px] text-muted truncate">{o.notes}</p>}
          </div>
          {canManage && (
            <div className="shrink-0">
              <button
                onClick={() => openEdit(o)}
                className="w-7 h-7 rounded-full border border-bone text-ash hover:text-brick hover:border-brick flex items-center justify-center text-[11px] transition-colors"
                title="Edit output"
              >
                ✎
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-body-sm font-medium text-ink">Sound Outputs</h3>
          <p className="text-body-xs text-muted">
            {outputs.length} output{outputs.length === 1 ? "" : "s"}.
            {" "}PA sends, wedges, IEMs, and feeds — where the mix goes.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors"
          >
            + Add output
          </button>
        )}
      </div>

      {outputs.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-4 py-6 text-center">
          <p className="text-body-sm text-ash">No outputs yet.</p>
          {canManage && <p className="text-body-xs text-muted mt-1">Add your PA sends, wedges, IEMs, and feeds.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const groupOutputs = outputs.filter((o) => g.types.includes(o.output_type || "wedge")).sort(outputSort);
            if (groupOutputs.length === 0) return null;
            return (
              <div key={g.key}>
                <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">{g.label} ({groupOutputs.length})</p>
                <div className="space-y-1.5">{groupOutputs.map(renderRow)}</div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setModalOpen(false)}>
          <div className="bg-paper rounded-card border border-bone w-full max-w-sm p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-body-md font-medium text-ink">{editingId ? "Edit output" : "Add output"}</h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-body-xs text-muted block mb-1">Type</label>
                <select
                  value={form.outputType}
                  onChange={(e) => setForm((f) => ({ ...f, outputType: e.target.value }))}
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                >
                  <option value="speaker">PA / speaker</option>
                  <option value="wedge">Wedge / monitor</option>
                  <option value="iem">IEM</option>
                  <option value="feed">Feed</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-body-xs text-muted block mb-1">Connection</label>
                <select
                  value={form.connection}
                  onChange={(e) => setForm((f) => ({ ...f, connection: e.target.value }))}
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                >
                  <option value="wired">Wired</option>
                  <option value="wireless">Wireless</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-body-xs text-muted block mb-1">Output / mix #</label>
                <input
                  value={form.outputNumber}
                  onChange={(e) => setForm((f) => ({ ...f, outputNumber: e.target.value }))}
                  placeholder="e.g. Mix 1"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>
              <div>
                <label className="text-body-xs text-muted block mb-1">Source / bus</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="optional"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
                />
              </div>
            </div>

            <div>
              <label className="text-body-xs text-muted block mb-1">Destination / position</label>
              <input
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder="e.g. Band wedge mid SL, FOH Left"
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
              Backup / safety
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
