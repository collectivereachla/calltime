"use client";

import { useState } from "react";
import type { ProductionExport, ExportCompanyMember } from "./lib";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtDate = (s: string | null) =>
  s ? new Date(s.length <= 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
const titleCase = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

type SectionKey = "orgTotals" | "directory" | "company" | "contracts" | "invoices" | "budget" | "revenue";

const SECTION_LABELS: Record<SectionKey, string> = {
  orgTotals: "Org totals",
  directory: "Directory",
  company: "Company",
  contracts: "Contracts",
  invoices: "Invoices",
  budget: "Budget",
  revenue: "Revenue",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3 mt-8">
      {children}
    </h3>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 italic">{children}</p>;
}

function CompanyTable({ members }: { members: ExportCompanyMember[] }) {
  if (members.length === 0) return <Empty>No one assigned.</Empty>;
  return (
    <table className="w-full text-sm" style={{ breakInside: "avoid" }}>
      <thead>
        <tr className="border-b border-gray-400 text-left text-xs uppercase tracking-wider text-gray-500">
          <th className="py-1.5 pr-3">Name</th>
          <th className="py-1.5 pr-3">Role</th>
          <th className="py-1.5 pr-3">Department</th>
          <th className="py-1.5 pr-3">Email</th>
          <th className="py-1.5">Phone</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m, i) => (
          <tr key={i} className="border-b border-gray-200">
            <td className="py-1.5 pr-3 font-medium">{m.name}</td>
            <td className="py-1.5 pr-3">{m.roleTitle ? titleCase(m.roleTitle) : ""}</td>
            <td className="py-1.5 pr-3">{m.department ? titleCase(m.department) : ""}</td>
            <td className="py-1.5 pr-3 text-gray-600">{m.email || ""}</td>
            <td className="py-1.5 text-gray-600">{m.phone || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductionSections({ p, visible }: { p: ProductionExport; visible: Set<SectionKey> }) {
  return (
    <>
      {visible.has("company") && (
        <>
          <SectionTitle>Company ({p.company.length})</SectionTitle>
          <CompanyTable members={p.company} />
        </>
      )}

      {visible.has("contracts") && (
        <>
          <SectionTitle>Contracts ({p.contracts.length})</SectionTitle>
          {p.contracts.length === 0 ? <Empty>No contracts.</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-1.5 pr-3">Name</th><th className="py-1.5 pr-3">Role</th><th className="py-1.5 pr-3">Compensation</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5">Countersigned</th>
                </tr>
              </thead>
              <tbody>
                {p.contracts.map((c) => (
                  <tr key={c.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-3 font-medium">{c.personName}</td>
                    <td className="py-1.5 pr-3">{c.roleTitle || ""}</td>
                    <td className="py-1.5 pr-3">{c.compensation || "—"}</td>
                    <td className="py-1.5 pr-3">{titleCase(c.status)}</td>
                    <td className="py-1.5 text-gray-600">{fmtDate(c.countersignedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {visible.has("invoices") && (
        <>
          <SectionTitle>Invoices ({p.invoices.length})</SectionTitle>
          {p.invoices.length === 0 ? <Empty>No invoices.</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-1.5 pr-3">Invoice</th><th className="py-1.5 pr-3">Payee</th><th className="py-1.5 pr-3">Bill to</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3 text-right">Amount</th><th className="py-1.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {p.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-3 font-mono text-xs">{inv.number}</td>
                    <td className="py-1.5 pr-3">{inv.payeeName}{inv.w9 ? " (W-9)" : ""}</td>
                    <td className="py-1.5 pr-3">{inv.payerName}</td>
                    <td className="py-1.5 pr-3">{titleCase(inv.status)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{money(inv.total)}</td>
                    <td className="py-1.5 text-gray-600">{fmtDate(inv.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {visible.has("budget") && (
        <>
          <SectionTitle>Budget ({p.budget.length})</SectionTitle>
          {p.budget.length === 0 ? <Empty>No budget items.</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-1.5 pr-3">Item</th><th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Vendor</th><th className="py-1.5 pr-3 text-right">Budget</th><th className="py-1.5 pr-3 text-right">Actual</th><th className="py-1.5">Paid</th>
                </tr>
              </thead>
              <tbody>
                {p.budget.map((b) => (
                  <tr key={b.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-3 font-medium">{b.name}</td>
                    <td className="py-1.5 pr-3">{titleCase(b.category)}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{b.vendor || ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{b.budget == null ? "—" : money(b.budget)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{b.actual == null ? "—" : money(b.actual)}</td>
                    <td className="py-1.5">{b.isPaid ? "Yes" : "No"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-black font-semibold">
                  <td className="py-1.5 pr-3" colSpan={3}>Total</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{money(p.totals.budget)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{money(p.totals.actual)}</td>
                  <td className="py-1.5"></td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}

      {visible.has("revenue") && (
        <>
          <SectionTitle>Revenue ({p.revenue.length})</SectionTitle>
          {p.revenue.length === 0 ? <Empty>No revenue items.</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-1.5 pr-3">Source</th><th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Donor / Event</th><th className="py-1.5 pr-3 text-right">Amount</th><th className="py-1.5">Received</th>
                </tr>
              </thead>
              <tbody>
                {p.revenue.map((r) => (
                  <tr key={r.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-3 font-medium">{r.source}</td>
                    <td className="py-1.5 pr-3">{titleCase(r.category)}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{r.donorOrEvent || ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{r.amount == null ? "—" : money(r.amount)}</td>
                    <td className="py-1.5">{r.isReceived ? "Yes" : "No"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-black font-semibold">
                  <td className="py-1.5 pr-3" colSpan={3}>Total</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{money(p.totals.revenue)}</td>
                  <td className="py-1.5">{money(p.totals.received)} in</td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

const PROD_KEYS: SectionKey[] = ["company", "contracts", "invoices", "budget", "revenue"];

export function ExportDocument({
  heading,
  subheading,
  description,
  backHref = "/ledger",
  generatedAt,
  orgMembers,
  orgTotals,
  productions,
}: {
  heading: string;
  subheading: string;
  description: string;
  backHref?: string;
  generatedAt: string;
  orgMembers?: ExportCompanyMember[];
  orgTotals?: { budget: number; actual: number; revenue: number; received: number };
  productions: ProductionExport[];
}) {
  // Which sections are available to toggle, in order.
  const available: SectionKey[] = [
    ...(orgTotals ? (["orgTotals"] as SectionKey[]) : []),
    ...(orgMembers ? (["directory"] as SectionKey[]) : []),
    ...(productions.length > 0 ? PROD_KEYS : []),
  ];

  const [visible, setVisible] = useState<Set<SectionKey>>(new Set(available));

  const toggle = (k: SectionKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const anyProdVisible = PROD_KEYS.some((k) => visible.has(k));

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Controls — never printed */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 z-10">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <p className="text-sm font-medium">{heading} — export</p>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a href={backHref} className="text-sm text-gray-500 hover:text-black">Back</a>
            <button
              onClick={() => window.print()}
              disabled={visible.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-black text-white hover:bg-black/90 disabled:opacity-40"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Sections:</span>
          {available.map((k) => {
            const on = visible.has(k);
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                className={`px-2.5 py-1 rounded-full text-xs ${on ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:text-black"}`}
              >
                {SECTION_LABELS[k]}
              </button>
            );
          })}
          <span className="mx-1 text-gray-300">|</span>
          <button onClick={() => setVisible(new Set(available))} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-500 hover:text-black">All</button>
          <button onClick={() => setVisible(new Set())} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-500 hover:text-black">None</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-10 py-12">
        {/* Cover */}
        <div className="mb-2">
          <p className="text-xs uppercase tracking-widest text-gray-500">{subheading}</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1">{heading}</h1>
          <p className="text-sm text-gray-500 mt-2">Generated {generatedAt} · Calltime</p>
        </div>

        {visible.size === 0 && (
          <p className="print:hidden text-center text-gray-400 py-20">Select a section to print.</p>
        )}

        {orgTotals && visible.has("orgTotals") && (
          <div className="mt-6 border border-gray-300 rounded">
            <div className="bg-gray-100 px-4 py-2 text-xs uppercase tracking-widest text-gray-600">
              Organization budget — all active productions
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 text-gray-600">Budgeted</td>
                  <td className="px-4 py-2 text-right font-mono">{money(orgTotals.budget)}</td>
                  <td className="px-4 py-2 text-gray-600">Revenue (projected)</td>
                  <td className="px-4 py-2 text-right font-mono">{money(orgTotals.revenue)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-gray-600">Spent</td>
                  <td className="px-4 py-2 text-right font-mono">{money(orgTotals.actual)}</td>
                  <td className="px-4 py-2 text-gray-600">Received</td>
                  <td className="px-4 py-2 text-right font-mono">{money(orgTotals.received)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {orgMembers && visible.has("directory") && (
          <>
            <SectionTitle>Company Directory ({orgMembers.length})</SectionTitle>
            <CompanyTable members={orgMembers} />
          </>
        )}

        {anyProdVisible && productions.map((p, idx) => (
          <div key={p.id} className={idx > 0 ? "break-before-page pt-2" : "mt-2"}>
            <div className="border-b-2 border-black pb-2 mt-4">
              <h2 className="text-2xl font-bold">{p.title}</h2>
              <p className="text-sm text-gray-600">
                {[p.playwright ? `by ${p.playwright}` : null, p.venue, titleCase(p.status)].filter(Boolean).join(" · ")}
              </p>
              <p className="text-sm text-gray-600">
                {[
                  p.firstRehearsal ? `First rehearsal ${fmtDate(p.firstRehearsal)}` : null,
                  p.openingDate ? `Opens ${fmtDate(p.openingDate)}` : null,
                  p.closingDate ? `Closes ${fmtDate(p.closingDate)}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ProductionSections p={p} visible={visible} />
          </div>
        ))}
      </div>
    </div>
  );
}
