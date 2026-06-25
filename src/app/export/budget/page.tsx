import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { computeBudgetPL, type PLContract } from "@/lib/budget-pl";
import { BudgetReport, type Settlement } from "./budget-report";

export const dynamic = "force-dynamic";

export default async function BudgetPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!person) redirect("/login");

  // Resolve org + production the SAME way the Ledger does, so the print route
  // works even when the active-production cookie was never set (cookie first,
  // else the org's current in-run production). Previously this relied on the
  // cookie alone and silently redirected to /ledger (landing on Contracts).
  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) redirect("/ledger");

  const role = await getRoleInOrg(person.id, orgId);
  if (!isOwnerRole(role)) redirect("/ledger");

  let pid = await getActiveProductionId();
  if (pid) {
    const { data: check } = await supabase
      .from("productions").select("id").eq("id", pid).eq("org_id", orgId).maybeSingle();
    if (!check) pid = null;
  }
  if (!pid) {
    const { data: prods } = await supabase
      .from("productions")
      .select("id")
      .eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true })
      .limit(1);
    pid = prods?.[0]?.id ?? null;
  }
  if (!pid) redirect("/ledger");

  const [{ data: org }, { data: prod }, { data: contractsRaw }, { data: budgetItems }, { data: revenueItems }, { data: copro }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("productions").select("title").eq("id", pid).maybeSingle(),
    supabase.from("contracts").select("id, person_name, role_title, compensation, template_id").eq("production_id", pid),
    supabase.from("budget_items").select("id, expense_name, category, budget_amount, vendor, notes, is_paid, off_top").eq("production_id", pid),
    supabase.from("revenue_items").select("id, source_name, category, amount, donor_or_event, notes, is_received").eq("production_id", pid),
    supabase.from("coproductions").select("lead_org_id, partner_org_id, lead_pct, partner_pct, basis, fiscal_agent, notes").eq("production_id", pid).maybeSingle(),
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

  // Co-production settlement, honoring the requested basis (?basis=tickets|gross|net).
  let settlement: Settlement | null = null;
  if (copro) {
    const { data: orgs } = await supabase
      .from("organizations").select("id, name").in("id", [copro.lead_org_id, copro.partner_org_id]);
    const leadName = orgs?.find((o) => o.id === copro.lead_org_id)?.name ?? "Lead";
    const partnerName = orgs?.find((o) => o.id === copro.partner_org_id)?.name ?? "Partner";
    const leadPct = Number(copro.lead_pct);
    const partnerPct = Number(copro.partner_pct);
    const contractBasis = (copro.basis as string) || "tickets";
    const allowed = ["tickets", "gross", "net"];
    const reqBasis = (await searchParams)?.basis;
    const basis = reqBasis && allowed.includes(reqBasis) ? reqBasis : contractBasis;

    const ticketSales = (pl.revByCat.ticket_sales || []).reduce((s, i) => s + (i.amount || 0), 0);
    const offTop = (budgetItems || []).filter((b) => b.off_top).reduce((s, b) => s + (b.budget_amount || 0), 0);
    const basisAmount = basis === "tickets" ? ticketSales - offTop : basis === "gross" ? ticketSales : ticketSales - pl.totalCosts;
    const splittable = basis === "tickets" ? Math.max(basisAmount, 0) : basisAmount;

    settlement = {
      leadName, partnerName, leadPct, partnerPct,
      fiscalAgent: (copro.fiscal_agent as "lead" | "partner") || "partner",
      basis, contractBasis,
      ticketSales, offTop, basisAmount,
      leadShare: (splittable * leadPct) / 100,
      partnerShare: (splittable * partnerPct) / 100,
      notes: (copro.notes as string | null) ?? null,
    };
  }

  const generatedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <BudgetReport pl={pl} orgName={org?.name || ""} title={prod?.title || ""} generatedAt={generatedAt} settlement={settlement} />
  );
}
