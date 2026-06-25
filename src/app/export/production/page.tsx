import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { fetchProductionExport } from "../lib";
import { ExportDocument } from "../export-document";

export const dynamic = "force-dynamic";

export default async function ProductionExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!person) redirect("/login");

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
      .from("productions").select("id").eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true }).limit(1);
    pid = prods?.[0]?.id ?? null;
  }
  if (!pid) redirect("/ledger");

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
