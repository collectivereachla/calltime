import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, orgIdForProduction } from "@/lib/membership";
import { fetchProductionExport } from "../lib";
import { ExportDocument } from "../export-document";

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
    <ExportDocument
      heading={data.title}
      subheading={org?.name || "Production Export"}
      description="Company, contracts, invoices, budget, and revenue. Toggle the sections you want, then Save as PDF."
      backHref="/ledger"
      generatedAt={generatedAt}
      productions={[data]}
    />
  );
}
