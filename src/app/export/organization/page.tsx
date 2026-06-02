import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { fetchProductionExport, fetchOrgMembers, fetchActiveProductionIds, type ProductionExport } from "../lib";
import { ExportDocument } from "../export-document";

export const dynamic = "force-dynamic";

export default async function OrganizationExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!person) redirect("/login");

  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) redirect("/home");

  const role = await getRoleInOrg(person.id, orgId);
  if (!isOwnerRole(role)) redirect("/home");

  const [{ data: org }, members, pids] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    fetchOrgMembers(orgId),
    fetchActiveProductionIds(orgId),
  ]);

  const productionsRaw = await Promise.all(pids.map((id) => fetchProductionExport(id)));
  const productions = productionsRaw.filter((p): p is ProductionExport => p != null);

  const orgTotals = productions.reduce(
    (acc, p) => ({
      budget: acc.budget + p.totals.budget,
      actual: acc.actual + p.totals.actual,
      revenue: acc.revenue + p.totals.revenue,
      received: acc.received + p.totals.received,
    }),
    { budget: 0, actual: 0, revenue: 0, received: 0 }
  );

  const generatedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <ExportDocument
      heading={org?.name || "Organization"}
      subheading="Organization Export"
      description="Company directory plus every active production's contracts, invoices, budget, and revenue. Toggle the sections you want, then Save as PDF."
      backHref="/ledger"
      generatedAt={generatedAt}
      orgMembers={members}
      orgTotals={orgTotals}
      productions={productions}
    />
  );
}
