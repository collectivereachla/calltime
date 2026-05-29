"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPayer, updatePayer, setProductionDefaultPayer,
  addPaymentMethod, togglePaymentMethod, deletePaymentMethod,
} from "./payment-settings-actions";

interface Payer { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }
interface Method { id: string; method: string; label: string | null; production_id: string | null; enabled: boolean }

interface Props {
  orgId: string;
  productionId: string;
  productionTitle: string;
  defaultPayerId: string | null;
  payers: Payer[];
  methods: Method[];
}

const EMPTY = { name: "", contactName: "", email: "", phone: "", address: "" };

export function PaymentSettings({ orgId, productionId, productionTitle, defaultPayerId, payers, methods }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingPayer, setEditingPayer] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [newMethod, setNewMethod] = useState("");
  const [newMethodLabel, setNewMethodLabel] = useState("");
  const [newMethodScope, setNewMethodScope] = useState<"show" | "org">("show");

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (r?.error) { setErr(r.error); return false; }
    router.refresh();
    return true;
  }

  function startEdit(p: Payer) {
    setEditingPayer(p.id);
    setForm({ name: p.name, contactName: p.contact_name || "", email: p.email || "", phone: p.phone || "", address: p.address || "" });
  }
  function startNew() { setEditingPayer("new"); setForm(EMPTY); }

  async function savePayer() {
    const ok = await run(() =>
      editingPayer === "new" ? createPayer(orgId, form) : updatePayer(editingPayer!, form)
    );
    if (ok) setEditingPayer(null);
  }

  return (
    <div className="mt-10 border-t border-bone pt-6">
      <button onClick={() => setOpen((o) => !o)} className="text-body-sm font-medium text-ash hover:text-ink">
        {open ? "▾" : "▸"} Payment settings
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {err && <p className="text-body-xs text-brick">{err}</p>}

          {/* Default payer */}
          <div>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Default Bill-To for {productionTitle}</p>
            <select
              value={defaultPayerId || ""}
              disabled={busy}
              onChange={(e) => run(() => setProductionDefaultPayer(productionId, e.target.value || null))}
              className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick"
            >
              <option value="">— none —</option>
              {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-body-xs text-muted mt-1">Invoices use this unless a contract names a different payer.</p>
          </div>

          {/* Payers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-body-xs text-muted uppercase tracking-wider">Payers</p>
              <button onClick={startNew} className="text-body-xs text-brick hover:underline">+ Add payer</button>
            </div>
            <div className="space-y-1.5">
              {payers.map((p) => (
                <div key={p.id} className="bg-card border border-bone rounded-card px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-sm text-ink">{p.name}</p>
                    {(p.email || p.address) && <p className="text-body-xs text-muted truncate">{[p.email, p.address].filter(Boolean).join(" · ")}</p>}
                  </div>
                  <button onClick={() => startEdit(p)} className="text-body-xs text-ash hover:text-brick shrink-0">Edit</button>
                </div>
              ))}
            </div>

            {editingPayer && (
              <div className="mt-3 bg-card border border-bone rounded-card p-4 space-y-2">
                <p className="text-body-sm font-medium text-ink">{editingPayer === "new" ? "New payer" : "Edit payer"}</p>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name (e.g. SWLA Juneteenth Committee)" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="Contact name" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                </div>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                <textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Billing address" rows={2} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                <div className="flex items-center gap-2">
                  <button onClick={savePayer} disabled={busy} className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                  <button onClick={() => setEditingPayer(null)} disabled={busy} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Payment methods */}
          <div>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Payment methods</p>
            <div className="space-y-1.5">
              {methods.map((m) => (
                <div key={m.id} className="bg-card border border-bone rounded-card px-3 py-2 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-body-sm text-ink">{m.label || m.method}</span>
                    <span className="ml-2 text-body-xs text-muted">{m.production_id ? "this show" : "all shows"}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => run(() => togglePaymentMethod(m.id, !m.enabled))} disabled={busy}
                      className={`text-body-xs ${m.enabled ? "text-confirmed" : "text-ash"} hover:underline`}>
                      {m.enabled ? "Enabled" : "Disabled"}
                    </button>
                    <button onClick={() => run(() => deletePaymentMethod(m.id))} disabled={busy} className="text-body-xs text-ash hover:text-brick">Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-body-xs text-muted block mb-1">Method key</label>
                <input value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="zelle" className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick w-28" />
              </div>
              <div>
                <label className="text-body-xs text-muted block mb-1">Label</label>
                <input value={newMethodLabel} onChange={(e) => setNewMethodLabel(e.target.value)} placeholder="Zelle" className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick w-32" />
              </div>
              <div>
                <label className="text-body-xs text-muted block mb-1">Scope</label>
                <select value={newMethodScope} onChange={(e) => setNewMethodScope(e.target.value as "show" | "org")} className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
                  <option value="show">This show only</option>
                  <option value="org">All shows</option>
                </select>
              </div>
              <button
                onClick={async () => {
                  if (!newMethod.trim()) return;
                  const ok = await run(() => addPaymentMethod(orgId, newMethodScope === "show" ? productionId : null, newMethod, newMethodLabel));
                  if (ok) { setNewMethod(""); setNewMethodLabel(""); }
                }}
                disabled={busy || !newMethod.trim()}
                className="px-3 py-2 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="text-body-xs text-muted mt-1">&quot;This show only&quot; methods (like Cash App for this co-pro) won&apos;t carry to future productions.</p>
          </div>
        </div>
      )}
    </div>
  );
}
