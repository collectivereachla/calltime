import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, orgIdForProduction } from "@/lib/membership";
import { computeBudgetPL, fmt, parseAmount, CAT_LABELS, REVENUE_CATS, EXPENSE_CATS, type PLContract } from "@/lib/budget-pl";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function BudgetPrintPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!person) redirect("/login");

  const pid = await getActiveProductionId();
  if (!pid) redirect("/ledger");

  const orgId = await orgIdForProduction(pid);
  const role = orgId ? await getRoleInOrg(person.id, orgId) : null;
  if (!isOwnerRole(role)) redirect("/ledger");

  const [{ data: org }, { data: prod }, { data: contractsRaw }, { data: budgetItems }, { data: revenueItems }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId!).maybeSingle(),
    supabase.from("productions").select("title").eq("id", pid).maybeSingle(),
    supabase.from("contracts").select("id, person_name, role_title, compensation, template_id").eq("production_id", pid),
    supabase.from("budget_items").select("id, expense_name, category, budget_amount, vendor, notes, is_paid").eq("production_id", pid),
    supabase.from("revenue_items").select("id, source_name, category, amount, donor_or_event, notes, is_received").eq("production_id", pid),
  ]);

  const tids = [...new Set((contractsRaw || []).map((c) => c.template_id).filter(Boolean))] as string[];
  const typeById = new Map<string, string>();
  if (tids.length) {
    const { data: tpls } = await supabase.from("contract_templates").select("id, contract_type").in("id", tids);
    for (const t of tpls || []) typeById.set(t.id as string, (t.contract_type as string) || "other");
  }
  const contracts: PLContract[] = (contractsRaw || []).map((c) => ({
    id: c.id,
    person_name: c.person_name,
    role_title: c.role_title,
    compensation: c.compensation,
    contract_type: (c.template_id && typeById.get(c.template_id)) || "other",
  }));

  const pl = computeBudgetPL(contracts, budgetItems || [], revenueItems || []);
  const generatedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const summary = [
    { label: "Revenue", value: pl.revenueTotal },
    { label: "Staff", value: pl.staffTotal },
    { label: "Talent", value: pl.talent.total },
    { label: "Production", value: pl.expenseTotal },
    { label: "Net", value: pl.net },
  ];

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{prod?.title} — Budget (P&amp;L)</p>
          <p className="text-xs text-gray-500">The budget report as it appears in the Ledger. Use your browser&apos;s print dialog to save as a PDF.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/ledger" className="text-sm text-gray-500 hover:text-black">Back</a>
          <PrintButton />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-10 py-12">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-gray-500">{org?.name || ""} · Budget</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1">{prod?.title}</h1>
          <p className="text-sm text-gray-500 mt-2">Generated {generatedAt} · Calltime</p>
        </div>

        {/* P&L summary */}
        <div className="grid grid-cols-5 gap-2 mb-8">
          {summary.map((c) => (
            <div key={c.label} className="border border-gray-300 rounded px-3 py-3 text-center">
              <p className={`font-mono text-base font-semibold ${c.label === "Net" && c.value < 0 ? "text-red-600" : ""}`}>{fmt(c.value)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Revenue */}
        <h2 className="text-xl font-bold border-b-2 border-black pb-1 mb-4">Revenue</h2>
        {REVENUE_CATS.map((cat) => {
          const items = pl.revByCat[cat];
          if (!items || items.length === 0) return null;
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

        {/* Staff */}
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

        {/* Talent */}
        <div className="flex items-center justify-between border-b-2 border-black pb-1 mb-4 mt-8">
          <h2 className="text-xl font-bold">Talent <span className="text-gray-400 text-sm font-normal">({pl.talentContracts.length})</span></h2>
          <span className="font-mono text-sm font-semibold">{fmt(pl.talent.total)}</span>
        </div>
        {Object.entries(pl.talent.byType).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(pl.talent.byType).sort(([, a], [, b]) => b.total - a.total).map(([type, { people, total }]) => (
              <span key={type} className="text-sm border border-gray-300 rounded px-2 py-1">
                <span className="font-mono font-semibold">{fmt(total)}</span>{" "}
                <span className="text-gray-500 capitalize">{type.replace(/_/g, " ")} ({people.length})</span>
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

        {/* Production expenses */}
        <h2 className="text-xl font-bold border-b-2 border-black pb-1 mb-4 mt-8">Production Expenses</h2>
        {EXPENSE_CATS.map((cat) => {
          const items = pl.expByCat[cat];
          if (!items || items.length === 0) return null;
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

        {/* Net */}
        <div className={`mt-8 rounded px-6 py-4 flex items-center justify-between ${pl.net >= 0 ? "bg-black text-white" : "border-2 border-red-600 text-red-600"}`}>
          <span className="text-lg font-bold">Net {pl.net >= 0 ? "Surplus" : "Shortfall"}</span>
          <span className="font-mono text-2xl font-bold">{fmt(Math.abs(pl.net))}</span>
        </div>
      </div>
    </div>
  );
}
