"use client";

import { useState } from "react";
import { fmt, parseAmount, CAT_LABELS, REVENUE_CATS, EXPENSE_CATS, computeBudgetPL } from "@/lib/budget-pl";

type PL = ReturnType<typeof computeBudgetPL>;

export type Settlement = {
  leadName: string; partnerName: string; leadPct: number; partnerPct: number;
  fiscalAgent: "lead" | "partner";
  basis: string; contractBasis: string;
  ticketSales: number; offTop: number; basisAmount: number;
  leadShare: number; partnerShare: number;
  notes: string | null;
};

const BASIS_LABEL: Record<string, string> = {
  tickets: "Per contract (ticket sales, venue off the top)",
  gross: "Gross ticket sales",
  net: "Net (ticket sales, after all production costs)",
};

export function BudgetReport({
  pl,
  orgName,
  title,
  generatedAt,
  settlement,
}: {
  pl: PL;
  orgName: string;
  title: string;
  generatedAt: string;
  settlement?: Settlement | null;
}) {
  const [mode, setMode] = useState<"detailed" | "collapsed">("detailed");

  const summary = [
    { label: "Revenue", value: pl.revenueTotal },
    { label: "Staff", value: pl.staffTotal },
    { label: "Talent", value: pl.talent.total },
    { label: "Production", value: pl.expenseTotal },
    { label: "Net", value: pl.net },
  ];

  const revCats = REVENUE_CATS.filter((c) => (pl.revByCat[c] || []).length > 0);
  const expCats = EXPENSE_CATS.filter((c) => (pl.expByCat[c] || []).length > 0);

  const Line = ({ label, count, total, noun }: { label: string; count: number; total: number; noun: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-200 text-sm">
      <span><span className="font-medium">{label}</span> <span className="text-gray-400">· {count} {noun}</span></span>
      <span className="font-mono">{fmt(total)}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Controls — never printed */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 z-10">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <p className="text-sm font-medium">{title} — Budget (P&amp;L)</p>
            <p className="text-xs text-gray-500">The budget report as it appears in the Ledger. Save as PDF from your browser&apos;s print dialog.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a href="/ledger" className="text-sm text-gray-500 hover:text-black">Back</a>
            <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium rounded-lg bg-black text-white hover:bg-black/90">
              Print / Save as PDF
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Detail:</span>
          <button onClick={() => setMode("detailed")}
            className={`px-2.5 py-1 rounded-full text-xs ${mode === "detailed" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:text-black"}`}>
            All details
          </button>
          <button onClick={() => setMode("collapsed")}
            className={`px-2.5 py-1 rounded-full text-xs ${mode === "collapsed" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:text-black"}`}>
            Collapsed (1 sheet)
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-10 py-12">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-gray-500">{orgName} · Budget</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1">{title}</h1>
          <p className="text-sm text-gray-500 mt-2">Generated {generatedAt} · Calltime{mode === "collapsed" ? " · Summary" : ""}</p>
        </div>

        {/* P&L summary — both modes */}
        <div className="grid grid-cols-5 gap-2 mb-8">
          {summary.map((c) => (
            <div key={c.label} className="border border-gray-300 rounded px-3 py-3 text-center">
              <p className={`font-mono text-base font-semibold ${c.label === "Net" && c.value < 0 ? "text-red-600" : ""}`}>{fmt(c.value)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {settlement && (() => {
          const agentName = settlement.fiscalAgent === "lead" ? settlement.leadName : settlement.partnerName;
          const otherName = settlement.fiscalAgent === "lead" ? settlement.partnerName : settlement.leadName;
          const otherShare = settlement.fiscalAgent === "lead" ? settlement.partnerShare : settlement.leadShare;
          const isModeling = settlement.basis !== settlement.contractBasis;
          return (
            <div className="border-2 border-black rounded mb-8" style={{ breakInside: "avoid" }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300">
                <h2 className="text-base font-bold">Co-production settlement</h2>
                <span className="text-xs text-gray-600">{BASIS_LABEL[settlement.basis] || settlement.basis}</span>
              </div>
              <div className="px-4 py-3">
                <div className="text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-200">
                    <span>Ticket sales (gross)</span><span className="font-mono">{fmt(settlement.ticketSales)}</span>
                  </div>
                  {settlement.basis === "tickets" && (
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span>Less venue, off the top</span><span className="font-mono">&minus;{fmt(settlement.offTop)}</span>
                    </div>
                  )}
                  {settlement.basis === "net" && (
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span>Less all production costs</span><span className="font-mono">&minus;{fmt(pl.totalCosts)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 font-semibold">
                    <span>Pool to split</span>
                    <span className={`font-mono ${settlement.basisAmount < 0 ? "text-red-600" : ""}`}>{fmt(settlement.basisAmount)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="border border-gray-300 rounded px-3 py-2 text-center">
                    <p className="font-mono text-base font-semibold">{fmt(settlement.leadShare)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{settlement.leadName} · {settlement.leadPct}%</p>
                  </div>
                  <div className="border border-gray-300 rounded px-3 py-2 text-center">
                    <p className="font-mono text-base font-semibold">{fmt(settlement.partnerShare)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{settlement.partnerName} · {settlement.partnerPct}%</p>
                  </div>
                </div>
                <p className="text-sm mt-3">
                  {settlement.basisAmount >= 0
                    ? `${agentName} collects ticket revenue and pays ${otherName} ${fmt(otherShare)}.`
                    : `Shortfall. ${otherName} owes ${agentName} ${fmt(Math.abs(otherShare))}.`}
                </p>
                {isModeling && (
                  <p className="text-xs text-gray-600 mt-2">
                    Modeling view. The signed agreement splits ticket sales {settlement.leadPct}/{settlement.partnerPct} as written; this {settlement.basis === "net" ? "net-after-costs" : "gross"} scenario is for negotiation only.
                  </p>
                )}
                {settlement.notes && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{settlement.notes}</p>}
              </div>
            </div>
          );
        })()}

        {mode === "collapsed" ? (
          /* ---------------- COLLAPSED: totals only, one sheet ---------------- */
          <>
            <h2 className="text-base font-bold border-b-2 border-black pb-1 mb-2">Revenue</h2>
            {revCats.length === 0 ? <p className="text-sm text-gray-400 italic mb-4">No revenue recorded.</p> : (
              <div className="mb-1">
                {revCats.map((cat) => {
                  const items = pl.revByCat[cat];
                  return <Line key={cat} label={CAT_LABELS[cat]} count={items.length} total={items.reduce((s, i) => s + (i.amount || 0), 0)} noun="entries" />;
                })}
                <div className="flex items-center justify-between py-1.5 text-sm font-semibold">
                  <span>Total revenue</span><span className="font-mono">{fmt(pl.revenueTotal)}</span>
                </div>
              </div>
            )}

            <h2 className="text-base font-bold border-b-2 border-black pb-1 mb-2 mt-6">Costs</h2>
            <Line label="Staff" count={pl.staffContracts.length} total={pl.staffTotal} noun="contracts" />
            <Line label="Talent" count={pl.talentContracts.length} total={pl.talent.total} noun="contracts" />
            {Object.keys(pl.talent.byType).length > 0 && (
              <div className="flex flex-wrap gap-2 my-2">
                {Object.entries(pl.talent.byType).sort(([, a], [, b]) => b.total - a.total).map(([type, { people, total }]) => (
                  <span key={type} className="text-xs border border-gray-300 rounded px-2 py-1">
                    <span className="font-mono font-semibold">{fmt(total)}</span> <span className="text-gray-500 capitalize">{type.replace(/_/g, " ")} ({people.length})</span>
                  </span>
                ))}
              </div>
            )}
            {expCats.map((cat) => {
              const items = pl.expByCat[cat];
              return <Line key={cat} label={CAT_LABELS[cat]} count={items.length} total={items.reduce((s, i) => s + (i.budget_amount || 0), 0)} noun="items" />;
            })}
            <div className="flex items-center justify-between py-1.5 text-sm font-semibold">
              <span>Total costs</span><span className="font-mono">{fmt(pl.totalCosts)}</span>
            </div>
          </>
        ) : (
          /* ---------------- DETAILED: every line item ---------------- */
          <>
            <h2 className="text-xl font-bold border-b-2 border-black pb-1 mb-4">Revenue</h2>
            {revCats.map((cat) => {
              const items = pl.revByCat[cat];
              const catTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
              return (
                <section key={`rev-${cat}`} className="mb-5" style={{ breakInside: "avoid" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{CAT_LABELS[cat]} <span className="text-gray-400 font-normal">({items.length})</span></span>
                    <span className="font-mono text-sm font-semibold">{fmt(catTotal)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id} className="border-b border-gray-200">
                          <td className="py-1 pr-3">{i.source_name}</td>
                          <td className="py-1 pr-3 text-gray-500">{i.donor_or_event || ""}</td>
                          <td className="py-1 pr-3 text-gray-500">{i.notes || ""}</td>
                          <td className="py-1 pr-3 text-right font-mono">{fmt(i.amount || 0)}</td>
                          <td className="py-1 text-gray-500 w-16 text-right">{i.is_received ? "received" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
            {pl.revenueTotal === 0 && <p className="text-sm text-gray-400 italic mb-5">No revenue recorded.</p>}

            <div className="flex items-center justify-between border-b-2 border-black pb-1 mb-4 mt-8">
              <h2 className="text-xl font-bold">Staff <span className="text-gray-400 text-sm font-normal">({pl.staffContracts.length})</span></h2>
              <span className="font-mono text-sm font-semibold">{fmt(pl.staffTotal)}</span>
            </div>
            {pl.staffContracts.length === 0 ? <p className="text-sm text-gray-400 italic mb-5">No staff contracts.</p> : (
              <table className="w-full text-sm mb-5">
                <tbody>
                  {pl.staffContracts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-200">
                      <td className="py-1 pr-3 font-medium">{c.person_name}</td>
                      <td className="py-1 pr-3 text-gray-500">{c.role_title}</td>
                      <td className="py-1 text-right font-mono">{c.compensation || fmt(parseAmount(c.compensation))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between border-b-2 border-black pb-1 mb-4 mt-8">
              <h2 className="text-xl font-bold">Talent <span className="text-gray-400 text-sm font-normal">({pl.talentContracts.length})</span></h2>
              <span className="font-mono text-sm font-semibold">{fmt(pl.talent.total)}</span>
            </div>
            {Object.keys(pl.talent.byType).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(pl.talent.byType).sort(([, a], [, b]) => b.total - a.total).map(([type, { people, total }]) => (
                  <span key={type} className="text-sm border border-gray-300 rounded px-2 py-1">
                    <span className="font-mono font-semibold">{fmt(total)}</span> <span className="text-gray-500 capitalize">{type.replace(/_/g, " ")} ({people.length})</span>
                  </span>
                ))}
              </div>
            )}
            {pl.talentContracts.length === 0 ? <p className="text-sm text-gray-400 italic mb-5">No talent contracts.</p> : (
              <table className="w-full text-sm mb-5">
                <tbody>
                  {pl.talentContracts.slice().sort((a, b) => parseAmount(b.compensation) - parseAmount(a.compensation)).map((c) => (
                    <tr key={c.id} className="border-b border-gray-200">
                      <td className="py-1 pr-3 font-medium">{c.person_name}</td>
                      <td className="py-1 pr-3 text-gray-500">{c.role_title}</td>
                      <td className="py-1 text-right font-mono">{c.compensation || fmt(parseAmount(c.compensation))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="text-xl font-bold border-b-2 border-black pb-1 mb-4 mt-8">Production Expenses</h2>
            {expCats.map((cat) => {
              const items = pl.expByCat[cat];
              const catTotal = items.reduce((s, i) => s + (i.budget_amount || 0), 0);
              return (
                <section key={`exp-${cat}`} className="mb-5" style={{ breakInside: "avoid" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{CAT_LABELS[cat]} <span className="text-gray-400 font-normal">({items.length})</span></span>
                    <span className="font-mono text-sm font-semibold">{fmt(catTotal)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id} className="border-b border-gray-200">
                          <td className="py-1 pr-3">{i.expense_name}</td>
                          <td className="py-1 pr-3 text-gray-500">{i.notes || i.vendor || ""}</td>
                          <td className="py-1 pr-3 text-right font-mono">{fmt(i.budget_amount || 0)}</td>
                          <td className="py-1 text-gray-500 w-12 text-right">{i.is_paid ? "paid" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
            {pl.expenseTotal === 0 && <p className="text-sm text-gray-400 italic mb-5">No production expenses recorded.</p>}
          </>
        )}

        {/* Net — both modes */}
        <div className={`mt-8 rounded px-6 py-4 flex items-center justify-between ${pl.net >= 0 ? "bg-black text-white" : "border-2 border-red-600 text-red-600"}`}>
          <span className="text-lg font-bold">Net {pl.net >= 0 ? "Surplus" : "Shortfall"}</span>
          <span className="font-mono text-2xl font-bold">{fmt(Math.abs(pl.net))}</span>
        </div>
      </div>
    </div>
  );
}
