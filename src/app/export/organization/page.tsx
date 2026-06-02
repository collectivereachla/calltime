import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { fetchProductionExport, fetchOrgMembers, fetchActiveProductionIds, type ProductionExport } from "../lib";
import { ExportDocument } from "../export-document";
import { PrintButton } from "../print-button";

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
    <div className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{org?.name || "Organization"} — full export</p>
          <p className="text-xs text-gray-500">Company directory plus every active production&apos;s contracts, invoices, budget, and revenue. Use your browser&apos;s print dialog to save as a PDF.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/ledger" className="print:hidden text-sm text-gray-500 hover:text-black">Back</a>
          <PrintButton />
        </div>
      </div>
      <ExportDocument
        heading={org?.name || "Organization"}
        subheading="Organization Export"
        generatedAt={generatedAt}
        orgMembers={members}
        orgTotals={orgTotals}
        productions={productions}
      />
    </div>
  );
}
