import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, orgIdForProduction } from "@/lib/membership";
import { computeBudgetPL, type PLContract } from "@/lib/budget-pl";
import { BudgetReport } from "./budget-report";

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

  return (
    <BudgetReport pl={pl} orgName={org?.name || ""} title={prod?.title || ""} generatedAt={generatedAt} />
  );
}
