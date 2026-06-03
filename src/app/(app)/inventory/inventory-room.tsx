"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { addInventoryItem, updateInventoryItem, deleteInventoryItem, checkoutItem, returnCheckout } from "./actions";

interface Item {
  id: string;
  kind: string;
  name: string;
  category: string | null;
  quantity: number;
  condition: string | null;
  owner_type: string | null;
  owner_name: string | null;
  storage_location: string | null;
  notes: string | null;
}
interface Checkout {
  id: string;
  item_id: string;
  production_id: string;
  quantity: number;
  productions: { title: string } | null;
}
interface Props {
  orgName: string;
  items: Item[];
  checkouts: Checkout[];
  productions: { id: string; title: string }[];
  activeProductionId: string | null;
}

const KINDS = ["costume", "prop", "set", "lighting", "sound", "furniture", "equipment", "other"];
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function InventoryRoom({ orgName, items, checkouts, productions, activeProductionId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(activeProductionId || productions[0]?.id || "");

  // form state
  const [f, setF] = useState({ name: "", kind: "prop", quantity: "1", storage_location: "", owner_name: "", notes: "" });

  const coByItem = useMemo(() => {
    const m = new Map<string, Checkout[]>();
    for (const c of checkouts) {
      const arr = m.get(c.item_id) || [];
      arr.push(c); m.set(c.item_id, arr);
    }
    return m;
  }, [checkouts]);

  const kindsPresent = useMemo(() => Array.from(new Set(items.map((i) => i.kind))).sort(), [items]);
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  function outQty(item: Item) {
    return (coByItem.get(item.id) || []).reduce((s, c) => s + c.quantity, 0);
  }

  async function run(fn: () => Promise<{ error?: string; success?: boolean }>) {
    setSaving(true);
    const r = await fn();
    setSaving(false);
    if (r?.error) { alert(r.error); return false; }
    router.refresh();
    return true;
  }

  async function add() {
    if (!f.name.trim()) return;
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, v));
    const ok = await run(() => addInventoryItem(fd));
    if (ok) { setAdding(false); setF({ name: "", kind: "prop", quantity: "1", storage_location: "", owner_name: "", notes: "" }); }
  }

  async function saveField(id: string, field: string, value: string) {
    const fd = new FormData(); fd.set("id", id); fd.set(field, value);
    await run(() => updateInventoryItem(fd));
  }

  async function checkout(itemId: string) {
    if (!target) { alert("Add a production to check items out to."); return; }
    const fd = new FormData(); fd.set("item_id", itemId); fd.set("production_id", target); fd.set("quantity", "1");
    await run(() => checkoutItem(fd));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-md text-ink">Inventory</h1>
          <p className="text-body-md text-ash mt-1">{orgName}&apos;s stock — owned across every production.</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 shrink-0">
          {adding ? "Cancel" : "Add item"}
        </button>
      </div>

      {adding && (
        <div className="bg-card border border-brick/30 rounded-card p-4 mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Item name" className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none" />
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none">
            {KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
          </select>
          <input value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} type="number" min="1" placeholder="Quantity" className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none" />
          <input value={f.storage_location} onChange={(e) => setF({ ...f, storage_location: e.target.value })} placeholder="Storage location" className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none" />
          <input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} placeholder="Owner (if not the company)" className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none" />
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" className="px-3 py-2 bg-paper border border-bone rounded text-body-sm focus:border-brick focus:outline-none" />
          <div className="md:col-span-2 flex justify-end">
            <button onClick={add} disabled={!f.name.trim() || saving} className="px-4 py-2 bg-brick text-paper text-body-sm font-medium rounded-card disabled:opacity-40">Add to inventory</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilter("all")} className={`px-2.5 py-1 rounded-full text-body-xs ${filter === "all" ? "bg-ink text-paper" : "bg-bone/50 text-ash hover:text-ink"}`}>All ({items.length})</button>
          {kindsPresent.map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-full text-body-xs ${filter === k ? "bg-ink text-paper" : "bg-bone/50 text-ash hover:text-ink"}`}>
              {titleCase(k)} ({items.filter((i) => i.kind === k).length})
            </button>
          ))}
        </div>
        {productions.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-body-xs text-muted">Check out to:</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="px-2 py-1 bg-card border border-bone rounded text-body-xs focus:border-brick focus:outline-none">
              {productions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}
      </div>

      {saving && <p className="text-body-xs text-muted mb-2">Saving…</p>}

      {shown.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-12 text-center">
          <p className="text-body-md text-ash">No inventory yet. Add your first item above.</p>
        </div>
      ) : (
        <div className="bg-card border border-bone rounded-card overflow-hidden">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-left text-body-xs uppercase tracking-wider text-muted border-b border-bone">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5 text-center">Qty</th>
                <th className="px-4 py-2.5 text-center">Available</th>
                <th className="px-4 py-2.5">Storage</th>
                <th className="px-4 py-2.5">In use</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => {
                const out = outQty(item);
                const avail = item.quantity - out;
                const cos = coByItem.get(item.id) || [];
                const editing = editId === item.id;
                return (
                  <tr key={item.id} className="border-b border-bone/60 align-top group">
                    <td className="px-4 py-2.5">
                      {editing ? (
                        <input defaultValue={item.name} onBlur={(e) => e.target.value !== item.name && saveField(item.id, "name", e.target.value)} className="w-full px-1 bg-paper border border-brick/40 rounded text-body-sm focus:outline-none" />
                      ) : <span className="text-ink font-medium">{item.name}</span>}
                      {item.owner_name && <span className="block text-body-xs text-muted">Owner: {item.owner_name}</span>}
                      {item.notes && <span className="block text-body-xs text-ash">{item.notes}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {editing ? (
                        <select defaultValue={item.kind} onChange={(e) => saveField(item.id, "kind", e.target.value)} className="px-1 py-0.5 bg-paper border border-brick/40 rounded text-body-xs">
                          {KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
                        </select>
                      ) : <span className="text-ash">{titleCase(item.kind)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {editing ? (
                        <input type="number" min="0" defaultValue={item.quantity} onBlur={(e) => Number(e.target.value) !== item.quantity && saveField(item.id, "quantity", e.target.value)} className="w-14 px-1 bg-paper border border-brick/40 rounded text-body-sm text-center focus:outline-none" />
                      ) : <span className="font-mono text-ink">{item.quantity}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono">
                      <span className={avail <= 0 ? "text-conflict" : "text-confirmed"}>{avail}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ash">
                      {editing ? (
                        <input defaultValue={item.storage_location || ""} onBlur={(e) => e.target.value !== (item.storage_location || "") && saveField(item.id, "storage_location", e.target.value)} className="w-full px-1 bg-paper border border-brick/40 rounded text-body-sm focus:outline-none" />
                      ) : (item.storage_location || "—")}
                    </td>
                    <td className="px-4 py-2.5">
                      {cos.length === 0 ? <span className="text-muted text-body-xs">—</span> : (
                        <div className="space-y-1">
                          {cos.map((c) => (
                            <div key={c.id} className="flex items-center gap-1.5">
                              <span className="text-body-xs px-1.5 py-0.5 rounded-full bg-brick/10 text-brick">{c.productions?.title || "Show"}{c.quantity > 1 ? ` ×${c.quantity}` : ""}</span>
                              <button onClick={() => run(() => returnCheckout(c.id))} className="text-body-xs text-muted hover:text-ink">return</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => checkout(item.id)} disabled={avail <= 0 || !target} className="text-body-xs text-brick hover:underline disabled:text-muted disabled:no-underline mr-2">Check out</button>
                      <button onClick={() => setEditId(editing ? null : item.id)} className="text-body-xs text-ash hover:text-ink mr-2">{editing ? "Done" : "Edit"}</button>
                      <button onClick={() => { if (confirm(`Delete ${item.name}?`)) run(() => deleteInventoryItem(item.id)); }} className="text-body-xs text-muted hover:text-conflict opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-body-xs text-muted mt-4">
        This is the company&apos;s stock across all productions. Check an item out to a show to track where it is; return it when it comes back. Costumes still live in Booth for now and will fold in here next.
      </p>
    </div>
  );
}
