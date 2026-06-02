import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, orgIdForProduction } from "@/lib/membership";
import { fetchProductionExport } from "../lib";
import { ExportDocument } from "../export-document";
import { PrintButton } from "../print-button";

export const dynamic = "force-dynamic";

export default async function ProductionExportPage() {
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

  const [{ data: org }, data] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId!).maybeSingle(),
    fetchProductionExport(pid),
  ]);
  if (!data) redirect("/ledger");

  const generatedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{data.title} — full export</p>
          <p className="text-xs text-gray-500">Company, contracts, invoices, budget, and revenue. Use your browser&apos;s print dialog to save as a PDF.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/ledger" className="print:hidden text-sm text-gray-500 hover:text-black">Back</a>
          <PrintButton />
        </div>
      </div>
      <ExportDocument
        heading={data.title}
        subheading={org?.name || "Production Export"}
        generatedAt={generatedAt}
        productions={[data]}
      />
    </div>
  );
}
