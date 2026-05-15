"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { addBudgetItem, updateBudgetItem, deleteBudgetItem } from "./budget-actions";
import { addRevenueItem, updateRevenueItem, deleteRevenueItem } from "./revenue-actions";
import { useRouter } from "next/navigation";

interface BudgetItem {
  id: string;
  expense_name: string;
  category: string;
  budget_amount: number | null;
  paid_by: string | null;
  vendor: string | null;
  notes: string | null;
  transaction_date: string | null;
}

interface RevenueItem {
  id: string;
  source_name: string;
  category: string;
  amount: number | null;
  donor_or_event: string | null;
  received_date: string | null;
  notes: string | null;
  platform: string | null;
}

interface ContractSummary {
  person_name: string;
  role_title: string;
  compensation: string | null;
  contract_type: string;
}

interface Props {
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  contractSummaries: ContractSummary[];
  canSeeContent: boolean;
  productionId: string;
}

function parseAmount(comp: string | null): number {
  if (!comp) return 0;
  const match = comp.match(/\$([\d,]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, "")) || 0;
}

const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EXPENSE_CATS = ["venue", "staff", "equipment", "transportation", "other"];
const REVENUE_CATS = ["sponsor", "ticket_sales", "grant", "donation", "other"];

const CAT_LABELS: Record<string, string> = {
  venue: "Venue", staff: "Staff", equipment: "Equipment",
  transportation: "Transportation", other: "Other",
  sponsor: "Sponsors", ticket_sales: "Ticket Sales",
  grant: "Grants", donation: "Donations",
};

const CAT_COLORS: Record<string, string> = {
  venue: "bg-indigo-100 text-indigo-700", staff: "bg-emerald-100 text-emerald-700",
  equipment: "bg-sky-100 text-sky-700", transportation: "bg-purple-100 text-purple-700",
  other: "bg-rose-100 text-rose-700", sponsor: "bg-teal-100 text-teal-700",
  ticket_sales: "bg-amber-100 text-amber-700", grant: "bg-lime-100 text-lime-700",
  donation: "bg-cyan-100 text-cyan-700",
};

function EditCell({ value, onSave, type = "text", className = "" }: {
  value: string; onSave: (v: string) => void; type?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`cursor-pointer hover:bg-bone/40 px-1 -mx-1 rounded transition-colors ${className}`}
      >
        {value || "\u00A0"}
      </span>
    );
  }

  return (
    <input
      ref={ref} type={type} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full px-1 -mx-1 bg-card border border-brick/40 rounded text-body-sm text-ink focus:outline-none"
    />
  );
}

export function BudgetView({ budgetItems, revenueItems, contractSummaries, canSeeContent, productionId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Talent
  const talent = useMemo(() => {
    const byType: Record<string, { people: ContractSummary[]; total: number }> = {};
    let total = 0;
    for (const c of contractSummaries) {
      const t = c.contract_type || "other";
      if (!byType[t]) byType[t] = { people: [], total: 0 };
      byType[t].people.push(c);
      const amt = parseAmount(c.compensation);
      byType[t].total += amt;
      total += amt;
    }
    return { byType, total };
  }, [contractSummaries]);

  // Expenses by category
  const expByCat = useMemo(() => {
    const cats: Record<string, BudgetItem[]> = {};
    for (const c of EXPENSE_CATS) cats[c] = [];
    for (const item of budgetItems) {
      const c = EXPENSE_CATS.includes(item.category) ? item.category : "other";
      cats[c].push(item);
    }
    return cats;
  }, [budgetItems]);

  // Revenue by category
  const revByCat = useMemo(() => {
    const cats: Record<string, RevenueItem[]> = {};
    for (const c of REVENUE_CATS) cats[c] = [];
    for (const item of revenueItems) {
      const c = REVENUE_CATS.includes(item.category) ? item.category : "other";
      cats[c].push(item);
    }
    return cats;
  }, [revenueItems]);

  const expenseTotal = budgetItems.reduce((s, i) => s + (i.budget_amount || 0), 0);
  const revenueTotal = revenueItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCosts = expenseTotal + talent.total;
  const net = revenueTotal - totalCosts;

  // Expense CRUD
  async function saveExpField(id: string, field: string, value: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id); fd.set(field, value);
    await updateBudgetItem(fd);
    setSaving(false); router.refresh();
  }
  async function addExp(category: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("expense_name", "New item"); fd.set("category", category); fd.set("budget_amount", "0");
    await addBudgetItem(fd);
    setSaving(false); router.refresh();
  }
  async function delExp(id: string) {
    if (!confirm("Remove this item?")) return;
    setSaving(true); await deleteBudgetItem(id); setSaving(false); router.refresh();
  }

  // Revenue CRUD
  async function saveRevField(id: string, field: string, value: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id); fd.set(field, value);
    await updateRevenueItem(fd);
    setSaving(false); router.refresh();
  }
  async function addRev(category: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("source_name", category === "ticket_sales" ? "New event" : "New sponsor");
    fd.set("category", category); fd.set("amount", "0");
    if (category === "ticket_sales") fd.set("platform", "Zeffy");
    await addRevenueItem(fd);
    setSaving(false); router.refresh();
  }
  async function delRev(id: string) {
    if (!confirm("Remove this item?")) return;
    setSaving(true); await deleteRevenueItem(id); setSaving(false); router.refresh();
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* P&L Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Revenue", value: fmt(revenueTotal), color: "text-confirmed" },
          { label: "Production", value: fmt(expenseTotal), color: "text-ink" },
          { label: "Talent", value: fmt(talent.total), color: "text-ink" },
          { label: "Total Costs", value: fmt(totalCosts), color: "text-ink" },
          { label: "Net", value: fmt(net), color: net >= 0 ? "text-confirmed" : "text-conflict" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-bone rounded-card px-4 py-3 text-center">
            <p className={`font-mono text-display-sm ${card.color}`}>{card.value}</p>
            <p className="text-body-xs text-muted mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {saving && <div className="text-body-xs text-muted text-center">Saving...</div>}

      {/* ── REVENUE ── */}
      <h2 className="font-display text-display-xs text-ink pt-2">Revenue</h2>

      {REVENUE_CATS.map((cat) => {
        const items = revByCat[cat];
        if (items.length === 0 && !canSeeContent) return null;
        const catTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
        if (items.length === 0 && catTotal === 0 && !canSeeContent) return null;

        return (
          <section key={`rev-${cat}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[cat] || CAT_COLORS.other}`}>
                  {CAT_LABELS[cat] || cat}
                </span>
                <span className="text-body-xs text-muted">{items.length} entries</span>
              </div>
              <span className="font-mono text-data-md text-confirmed font-semibold">{fmt(catTotal)}</span>
            </div>

            {canSeeContent ? (
              <div className="bg-card border border-bone rounded-card overflow-hidden">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-bone bg-bone/20">
                      <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Source</th>
                      <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">
                        {cat === "ticket_sales" ? "Event" : "Donor"}
                      </th>
                      <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Notes</th>
                      <th className="text-right px-4 py-2 text-muted font-mono text-data-sm">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-bone/50 group">
                        <td className="px-4 py-2 text-ink">
                          <EditCell value={item.source_name} onSave={(v) => saveRevField(item.id, "source_name", v)} />
                        </td>
                        <td className="px-4 py-2 text-ash">
                          <EditCell value={item.donor_or_event || ""} onSave={(v) => saveRevField(item.id, "donor_or_event", v)} />
                        </td>
                        <td className="px-4 py-2 text-ash">
                          <EditCell value={item.notes || (item.platform ? `via ${item.platform}` : "")} onSave={(v) => saveRevField(item.id, "notes", v)} />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-confirmed">
                          <EditCell
                            value={item.amount != null ? String(item.amount) : ""}
                            onSave={(v) => saveRevField(item.id, "amount", v)}
                            type="number" className="text-right"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <button onClick={() => delRev(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted hover:text-conflict text-body-xs transition-opacity"
                          >&times;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addRev(cat)}
                  className="w-full px-4 py-2 text-body-xs text-muted hover:text-ink hover:bg-bone/20 text-left transition-colors"
                >+ Add {cat === "ticket_sales" ? "event" : "entry"}</button>
              </div>
            ) : items.length > 0 ? (
              <div className="bg-card border border-bone rounded-card px-4 py-3">
                <p className="text-body-sm text-ash">
                  {items.length} entries totaling <span className="font-mono font-medium text-confirmed">{fmt(catTotal)}</span>
                </p>
              </div>
            ) : null}
          </section>
        );
      })}

      {/* Add revenue category buttons — owner */}
      {canSeeContent && (
        <div className="flex gap-2 flex-wrap">
          {REVENUE_CATS.filter((c) => revByCat[c].length === 0).map((cat) => (
            <button key={cat} onClick={() => addRev(cat)}
              className="text-body-xs text-muted hover:text-ink px-3 py-1.5 border border-dashed border-bone rounded hover:border-ash transition-colors"
            >+ {CAT_LABELS[cat]}</button>
          ))}
        </div>
      )}

      {/* ── EXPENSES ── */}
      <h2 className="font-display text-display-xs text-ink pt-2">Expenses</h2>

      {EXPENSE_CATS.map((cat) => {
        const items = expByCat[cat];
        if (items.length === 0 && !canSeeContent) return null;
        const catTotal = items.reduce((s, i) => s + (i.budget_amount || 0), 0);

        return (
          <section key={`exp-${cat}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[cat] || CAT_COLORS.other}`}>
                  {CAT_LABELS[cat] || cat}
                </span>
                <span className="text-body-xs text-muted">{items.length} items</span>
              </div>
              <span className="font-mono text-data-md text-ink font-semibold">{fmt(catTotal)}</span>
            </div>

            {canSeeContent ? (
              <div className="bg-card border border-bone rounded-card overflow-hidden">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-bone bg-bone/20">
                      <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Item</th>
                      <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Notes</th>
                      <th className="text-right px-4 py-2 text-muted font-mono text-data-sm">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-bone/50 group">
                        <td className="px-4 py-2 text-ink">
                          <EditCell value={item.expense_name} onSave={(v) => saveExpField(item.id, "expense_name", v)} />
                        </td>
                        <td className="px-4 py-2 text-ash">
                          <EditCell value={item.notes || item.vendor || ""} onSave={(v) => saveExpField(item.id, "notes", v)} />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-ink">
                          <EditCell
                            value={item.budget_amount != null ? String(item.budget_amount) : ""}
                            onSave={(v) => saveExpField(item.id, "budget_amount", v)}
                            type="number" className="text-right"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <button onClick={() => delExp(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted hover:text-conflict text-body-xs transition-opacity"
                          >&times;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addExp(cat)}
                  className="w-full px-4 py-2 text-body-xs text-muted hover:text-ink hover:bg-bone/20 text-left transition-colors"
                >+ Add item</button>
              </div>
            ) : items.length > 0 ? (
              <div className="bg-card border border-bone rounded-card px-4 py-3">
                <p className="text-body-sm text-ash">
                  {items.length} line items totaling <span className="font-mono font-medium text-ink">{fmt(catTotal)}</span>
                </p>
              </div>
            ) : null}
          </section>
        );
      })}

      {canSeeContent && (
        <div className="flex gap-2 flex-wrap">
          {EXPENSE_CATS.filter((c) => expByCat[c].length === 0).map((cat) => (
            <button key={cat} onClick={() => addExp(cat)}
              className="text-body-xs text-muted hover:text-ink px-3 py-1.5 border border-dashed border-bone rounded hover:border-ash transition-colors"
            >+ {CAT_LABELS[cat]}</button>
          ))}
        </div>
      )}

      {/* ── TALENT ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-body-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Talent</span>
            <span className="text-body-xs text-muted">{contractSummaries.length} contracts</span>
          </div>
          <span className="font-mono text-data-md text-ink font-semibold">{fmt(talent.total)}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {Object.entries(talent.byType).sort(([,a],[,b]) => b.total - a.total).map(([type, { people, total }]) => (
            <div key={type} className="bg-card border border-bone rounded-card px-3 py-2">
              <p className="font-mono text-data-sm text-ink font-semibold">{fmt(total)}</p>
              <p className="text-body-xs text-ash capitalize">{type.replace(/_/g, " ")} ({people.length})</p>
            </div>
          ))}
        </div>

        {canSeeContent ? (
          <div className="bg-card border border-bone rounded-card overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-bone bg-bone/20">
                  <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Name</th>
                  <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Role</th>
                  <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Type</th>
                  <th className="text-right px-4 py-2 text-muted font-mono text-data-sm">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contractSummaries.sort((a,b) => parseAmount(b.compensation) - parseAmount(a.compensation)).map((c,i) => (
                  <tr key={i} className="border-b border-bone/50">
                    <td className="px-4 py-2 text-ink">{c.person_name}</td>
                    <td className="px-4 py-2 text-ash">{c.role_title}</td>
                    <td className="px-4 py-2 text-ash capitalize">{c.contract_type.replace(/_/g," ")}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{c.compensation || "TBD"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-bone rounded-card px-4 py-3">
            <p className="text-body-xs text-muted">Individual compensation is only visible to the producer.</p>
          </div>
        )}
      </section>

      {/* Grand total */}
      <div className={`rounded-card px-6 py-4 flex items-center justify-between ${net >= 0 ? "bg-ink text-paper" : "bg-conflict/10 border border-conflict/30 text-conflict"}`}>
        <span className="font-display text-display-xs">Net {net >= 0 ? "Surplus" : "Shortfall"}</span>
        <span className="font-mono text-display-sm font-bold">{fmt(Math.abs(net))}</span>
      </div>
    </div>
  );
}
