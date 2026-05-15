"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { addBudgetItem, updateBudgetItem, deleteBudgetItem } from "./budget-actions";
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

interface ContractSummary {
  person_name: string;
  role_title: string;
  compensation: string | null;
  contract_type: string;
}

interface Props {
  budgetItems: BudgetItem[];
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

const CATEGORIES = ["venue", "staff", "equipment", "transportation", "other"];

const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue", staff: "Staff", equipment: "Equipment",
  transportation: "Transportation", other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  venue: "bg-indigo-100 text-indigo-700",
  staff: "bg-emerald-100 text-emerald-700",
  equipment: "bg-sky-100 text-sky-700",
  transportation: "bg-purple-100 text-purple-700",
  other: "bg-rose-100 text-rose-700",
};

// Inline editable cell
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
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full px-1 -mx-1 bg-card border border-brick/40 rounded text-body-sm text-ink focus:outline-none"
    />
  );
}

export function BudgetView({ budgetItems, contractSummaries, canSeeContent, productionId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Talent totals from contracts
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

  // Budget items by category
  const byCategory = useMemo(() => {
    const cats: Record<string, BudgetItem[]> = {};
    for (const cat of CATEGORIES) cats[cat] = [];
    for (const item of budgetItems) {
      const cat = CATEGORIES.includes(item.category) ? item.category : "other";
      cats[cat].push(item);
    }
    return cats;
  }, [budgetItems]);

  const productionTotal = budgetItems.reduce((s, i) => s + (i.budget_amount || 0), 0);
  const grandTotal = productionTotal + talent.total;

  async function saveField(id: string, field: string, value: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, value);
    await updateBudgetItem(fd);
    setSaving(false);
    router.refresh();
  }

  async function handleAdd(category: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("expense_name", "New item");
    fd.set("category", category);
    fd.set("budget_amount", "0");
    await addBudgetItem(fd);
    setSaving(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this budget item?")) return;
    setSaving(true);
    await deleteBudgetItem(id);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Budget", value: fmt(grandTotal) },
          { label: "Production Costs", value: fmt(productionTotal) },
          { label: "Talent Costs", value: fmt(talent.total) },
          { label: "Contracts", value: String(contractSummaries.length) },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-bone rounded-card px-4 py-3 text-center">
            <p className="font-mono text-display-sm text-ink">{card.value}</p>
            <p className="text-body-xs text-muted mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {saving && (
        <div className="text-body-xs text-muted text-center">Saving...</div>
      )}

      {/* Production cost categories */}
      {CATEGORIES.map((cat) => {
        const items = byCategory[cat];
        if (items.length === 0 && !canSeeContent) return null;
        const catTotal = items.reduce((s, i) => s + (i.budget_amount || 0), 0);

        return (
          <section key={cat}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>
                  {CATEGORY_LABELS[cat] || cat}
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
                          <EditCell
                            value={item.expense_name}
                            onSave={(v) => saveField(item.id, "expense_name", v)}
                          />
                        </td>
                        <td className="px-4 py-2 text-ash">
                          <EditCell
                            value={item.notes || item.vendor || ""}
                            onSave={(v) => saveField(item.id, "notes", v)}
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-ink">
                          <EditCell
                            value={item.budget_amount != null ? String(item.budget_amount) : ""}
                            onSave={(v) => saveField(item.id, "budget_amount", v)}
                            type="number"
                            className="text-right"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted hover:text-conflict text-body-xs transition-opacity"
                            title="Remove"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  onClick={() => handleAdd(cat)}
                  className="w-full px-4 py-2 text-body-xs text-muted hover:text-ink hover:bg-bone/20 text-left transition-colors"
                >
                  + Add item
                </button>
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

      {/* Add new category — owner only */}
      {canSeeContent && (
        <div className="flex gap-2">
          {CATEGORIES.filter((c) => byCategory[c].length === 0).map((cat) => (
            <button
              key={cat}
              onClick={() => handleAdd(cat)}
              className="text-body-xs text-muted hover:text-ink px-3 py-1.5 border border-dashed border-bone rounded hover:border-ash transition-colors"
            >
              + {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Talent section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-body-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Talent
            </span>
            <span className="text-body-xs text-muted">{contractSummaries.length} contracts</span>
          </div>
          <span className="font-mono text-data-md text-ink font-semibold">{fmt(talent.total)}</span>
        </div>

        {/* Category subtotals — visible to all */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {Object.entries(talent.byType)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([type, { people, total }]) => (
            <div key={type} className="bg-card border border-bone rounded-card px-3 py-2">
              <p className="font-mono text-data-sm text-ink font-semibold">{fmt(total)}</p>
              <p className="text-body-xs text-ash capitalize">{type.replace(/_/g, " ")} ({people.length})</p>
            </div>
          ))}
        </div>

        {/* Individual — owner only */}
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
                {contractSummaries
                  .sort((a, b) => parseAmount(b.compensation) - parseAmount(a.compensation))
                  .map((c, i) => (
                  <tr key={i} className="border-b border-bone/50">
                    <td className="px-4 py-2 text-ink">{c.person_name}</td>
                    <td className="px-4 py-2 text-ash">{c.role_title}</td>
                    <td className="px-4 py-2 text-ash capitalize">{c.contract_type.replace(/_/g, " ")}</td>
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

      {/* Grand total bar */}
      <div className="bg-ink text-paper rounded-card px-6 py-4 flex items-center justify-between">
        <span className="font-display text-display-xs">Total Budget</span>
        <span className="font-mono text-display-sm font-bold">{fmt(grandTotal)}</span>
      </div>
    </div>
  );
}
