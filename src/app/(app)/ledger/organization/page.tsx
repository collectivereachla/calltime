import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { fetchOrgBudgetRollup } from "@/lib/budget-rollup";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OrganizationBudgetPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("id", personId!).maybeSingle();
  if (!person) redirect("/login");

  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) redirect("/ledger");

  const role = await getRoleInOrg(person.id, orgId);
  if (!isOwnerRole(role)) redirect("/ledger");

  const [{ data: org }, rollup] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    fetchOrgBudgetRollup(orgId),
  ]);

  const t = rollup.totals;
  const cash = t.received - t.spent;

  // Org-level Statement of Activity — money not tied to a single production
  const { data: financeRows } = await supabase
    .from("org_finance_lines")
    .select("section, category, amount, period_label, sort_order")
    .eq("org_id", orgId);
  const fl = (financeRows || [])
    .map((l) => ({ ...l, amount: Number(l.amount) }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const sumAmt = (arr: { amount: number }[]) => arr.reduce((s, l) => s + l.amount, 0);
  const revLines = fl.filter((l) => l.section === "revenue");
  const expLines = fl.filter((l) => l.section === "expenditure");
  const otherRevLines = fl.filter((l) => l.section === "other_revenue");
  const balanceLine = fl.find((l) => l.section === "balance");
  const revTotal = sumAmt(revLines);
  const expTotal = sumAmt(expLines);
  const netOperating = revTotal - expTotal;
  const otherRevTotal = sumAmt(otherRevLines);
  const netRevenue = netOperating + otherRevTotal;
  const hasStatement = fl.length > 0;
  const statementPeriod = fl[0]?.period_label || "";
  const money2 = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const Stat = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
    <div className="bg-card border border-bone rounded-card px-4 py-3">
      <p className="text-body-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-data-md mt-1 ${accent ? "text-brick" : "text-ink"}`}>{money(value)}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6">
        <a href="/ledger" className="text-body-xs text-ash hover:text-ink">← Ledger</a>
        <h1 className="font-display text-display-md text-ink mt-1">Organization Budget</h1>
        <p className="text-body-md text-ash mt-1">
          {org?.name || "Organization"} — every active production combined.
        </p>
      </div>

      {hasStatement && (
        <div className="bg-card border border-bone rounded-card overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-bone">
            <p className="font-display text-display-xs text-ink">Statement of Activity</p>
            {statementPeriod && <p className="text-body-xs text-muted mt-0.5">{statementPeriod}</p>}
          </div>
          <table className="w-full text-body-sm">
            <tbody>
              <tr><td colSpan={2} className="px-4 pt-3 pb-1 text-body-xs uppercase tracking-wider text-muted">Revenue</td></tr>
              {revLines.map((l) => (
                <tr key={`rev-${l.category}`} className="border-b border-bone/40">
                  <td className="px-4 py-1.5 text-ink">{l.category}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-ink">{money2(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-b border-bone font-semibold">
                <td className="px-4 py-1.5 text-ink">Total Revenue</td>
                <td className="px-4 py-1.5 text-right font-mono text-ink">{money2(revTotal)}</td>
              </tr>
              <tr><td colSpan={2} className="px-4 pt-3 pb-1 text-body-xs uppercase tracking-wider text-muted">Expenditures</td></tr>
              {expLines.map((l) => (
                <tr key={`exp-${l.category}`} className="border-b border-bone/40">
                  <td className="px-4 py-1.5 text-ink">{l.category}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-ink">{money2(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-b border-bone font-semibold">
                <td className="px-4 py-1.5 text-ink">Total Expenditures</td>
                <td className="px-4 py-1.5 text-right font-mono text-ink">{money2(expTotal)}</td>
              </tr>
              <tr className="border-b border-bone">
                <td className="px-4 py-2 text-ink font-medium">Net Operating Revenue</td>
                <td className={`px-4 py-2 text-right font-mono ${netOperating >= 0 ? "text-confirmed" : "text-conflict"}`}>{money2(netOperating)}</td>
              </tr>
              {otherRevLines.length > 0 && (
                <>
                  <tr><td colSpan={2} className="px-4 pt-3 pb-1 text-body-xs uppercase tracking-wider text-muted">Other Revenue</td></tr>
                  {otherRevLines.map((l) => (
                    <tr key={`oth-${l.category}`} className="border-b border-bone/40">
                      <td className="px-4 py-1.5 text-ink">{l.category}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-ink">{money2(l.amount)}</td>
                    </tr>
                  ))}
                </>
              )}
              <tr className="border-t-2 border-ink font-semibold">
                <td className="px-4 py-2 text-ink">Net Revenue</td>
                <td className={`px-4 py-2 text-right font-mono ${netRevenue >= 0 ? "text-confirmed" : "text-conflict"}`}>{money2(netRevenue)}</td>
              </tr>
              {balanceLine && (
                <tr className="border-t border-bone bg-bone/20">
                  <td className="px-4 py-2 text-ink font-medium">{balanceLine.category}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink">{money2(balanceLine.amount)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-body-xs text-muted px-4 py-2.5 border-t border-bone">
            Org-level books, separate from the per-production rollup below.
          </p>
        </div>
      )}

      {rollup.shows.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No active productions to roll up.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat label="Budgeted" value={t.budget} />
            <Stat label="Spent" value={t.spent} />
            <Stat label="Revenue (projected)" value={t.revenue} />
            <Stat label="Received" value={t.received} accent />
          </div>

          <div className="bg-card border border-bone rounded-card px-4 py-3 mb-8 flex flex-wrap gap-x-8 gap-y-1">
            <span className="text-body-sm text-ash">
              Cash position (received − spent):{" "}
              <span className={`font-mono ${cash < 0 ? "text-conflict" : "text-confirmed"}`}>{money(cash)}</span>
            </span>
            <span className="text-body-sm text-ash">
              Projected net (revenue − budget):{" "}
              <span className="font-mono text-ink">{money(t.revenue - t.budget)}</span>
            </span>
          </div>

          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">By production</p>
          <div className="bg-card border border-bone rounded-card overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-body-xs uppercase tracking-wider text-muted border-b border-bone">
                  <th className="px-4 py-2.5">Production</th>
                  <th className="px-4 py-2.5 text-right">Budgeted</th>
                  <th className="px-4 py-2.5 text-right">Spent</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                  <th className="px-4 py-2.5 text-right">Received</th>
                </tr>
              </thead>
              <tbody>
                {rollup.shows.map((s) => (
                  <tr key={s.id} className="border-b border-bone/60">
                    <td className="px-4 py-2.5">
                      <span className="text-ink font-medium">{s.title}</span>
                      <span className="text-body-xs text-muted ml-2 font-mono">{titleCase(s.status)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{money(s.budget)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{money(s.spent)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{money(s.revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{money(s.received)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink font-semibold">
                  <td className="px-4 py-2.5 text-ink">All productions</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{money(t.budget)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{money(t.spent)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{money(t.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{money(t.received)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-body-xs text-muted mt-4">
            Rolls up active productions only. Org-level overhead not tied to a show isn&apos;t tracked yet.
          </p>
        </>
      )}
    </div>
  );
}
