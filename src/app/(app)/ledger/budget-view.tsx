"use client";

import { useMemo } from "react";

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
}

function parseAmount(comp: string | null): number {
  if (!comp) return 0;
  const match = comp.match(/\$([\ d,]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, "")) || 0;
}

const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue",
  staff: "Staff",
  talent: "Talent",
  equipment: "Equipment",
  transportation: "Transportation",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  venue: "bg-indigo-100 text-indigo-700",
  staff: "bg-emerald-100 text-emerald-700",
  talent: "bg-amber-100 text-amber-700",
  equipment: "bg-sky-100 text-sky-700",
  transportation: "bg-purple-100 text-purple-700",
  other: "bg-rose-100 text-rose-700",
};

export function BudgetView({ budgetItems, contractSummaries, canSeeContent }: Props) {
  const data = useMemo(() => {
    // Budget items by category
    const categories: Record<string, { items: BudgetItem[]; total: number }> = {};
    for (const item of budgetItems) {
      if (!categories[item.category]) categories[item.category] = { items: [], total: 0 };
      categories[item.category].items.push(item);
      categories[item.category].total += item.budget_amount || 0;
    }

    // Talent costs from contracts
    const talentByType: Record<string, { people: ContractSummary[]; total: number }> = {};
    let talentTotal = 0;
    for (const c of contractSummaries) {
      const type = c.contract_type || "other";
      if (!talentByType[type]) talentByType[type] = { people: [], total: 0 };
      talentByType[type].people.push(c);
      const amt = parseAmount(c.compensation);
      talentByType[type].total += amt;
      talentTotal += amt;
    }

    // Grand total
    const budgetTotal = Object.values(categories).reduce((sum, cat) => sum + cat.total, 0);
    const grandTotal = budgetTotal + talentTotal;

    return { categories, talentByType, talentTotal, budgetTotal, grandTotal };
  }, [budgetItems, contractSummaries]);

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
          <p className="font-mono text-display-sm text-ink">{fmt(data.grandTotal)}</p>
          <p className="text-body-xs text-muted mt-0.5">Total Budget</p>
        </div>
        <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
          <p className="font-mono text-display-sm text-ink">{fmt(data.budgetTotal)}</p>
          <p className="text-body-xs text-muted mt-0.5">Production Costs</p>
        </div>
        <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
          <p className="font-mono text-display-sm text-ink">{fmt(data.talentTotal)}</p>
          <p className="text-body-xs text-muted mt-0.5">Talent Costs</p>
        </div>
        <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
          <p className="font-mono text-display-sm text-ink">{contractSummaries.length}</p>
          <p className="text-body-xs text-muted mt-0.5">Contracts</p>
        </div>
      </div>

      {/* Production costs by category */}
      {Object.entries(data.categories)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([cat, { items, total }]) => (
        <section key={cat}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>
                {CATEGORY_LABELS[cat] || cat}
              </span>
              <span className="text-body-xs text-muted">{items.length} items</span>
            </div>
            <span className="font-mono text-data-md text-ink font-semibold">{fmt(total)}</span>
          </div>

          {canSeeContent ? (
            <div className="bg-card border border-bone rounded-card overflow-hidden">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-bone bg-bone/20">
                    <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Item</th>
                    <th className="text-left px-4 py-2 text-muted font-mono text-data-sm">Notes</th>
                    <th className="text-right px-4 py-2 text-muted font-mono text-data-sm">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-bone/50">
                      <td className="px-4 py-2 text-ink">{item.expense_name}</td>
                      <td className="px-4 py-2 text-ash">{item.notes || item.vendor || ""}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink">{item.budget_amount ? fmt(item.budget_amount) : "TBD"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-card border border-bone rounded-card px-4 py-3">
              <p className="text-body-sm text-ash">
                {items.length} line items totaling <span className="font-mono font-medium text-ink">{fmt(total)}</span>
              </p>
            </div>
          )}
        </section>
      ))}

      {/* Talent costs from contracts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS.talent}`}>
              Talent
            </span>
            <span className="text-body-xs text-muted">{contractSummaries.length} contracts</span>
          </div>
          <span className="font-mono text-data-md text-ink font-semibold">{fmt(data.talentTotal)}</span>
        </div>

        {/* Category subtotals — visible to all with access */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {Object.entries(data.talentByType)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([type, { people, total: subTotal }]) => (
            <div key={type} className="bg-card border border-bone rounded-card px-3 py-2">
              <p className="font-mono text-data-sm text-ink font-semibold">{fmt(subTotal)}</p>
              <p className="text-body-xs text-ash capitalize">{type.replace(/_/g, " ")} ({people.length})</p>
            </div>
          ))}
        </div>

        {/* Individual breakdown — owners only */}
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
            <p className="text-body-xs text-muted">Individual compensation details are only visible to the producer.</p>
          </div>
        )}
      </section>
    </div>
  );
}
