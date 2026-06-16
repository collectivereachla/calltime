import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole, resolveActingOrgId } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";
import { ensurePlaybill } from "./actions";
import { PlaybillEditor } from "./playbill-editor";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["pre_production", "rehearsal", "tech", "in_run"];

export default async function PlaybillPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);
  const orgId = await resolveActingOrgId(personId!);

  if (!orgId) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10"><p className="text-body-md text-ash">No organization found.</p></div>;
  }

  const role = await getRoleInOrg(personId!, orgId);
  if (!isLeadershipRole(role)) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10"><p className="text-body-md text-ash">The playbill builder is for production leadership.</p></div>;
  }

  // Resolve the active production within this org.
  let pid = await getActiveProductionId();
  const { data: visible } = await supabase
    .from("production_assignments")
    .select("production_id, productions!inner(id, title, status, org_id, opening_date)")
    .eq("person_id", personId!)
    .eq("active", true)
    .in("productions.status", ACTIVE_STATUSES);
  const inOrg = (visible || []).filter((v) => (v.productions as unknown as { org_id: string }).org_id === orgId);
  const validIds = new Set(inOrg.map((v) => v.production_id as string));
  if (!pid || !validIds.has(pid)) {
    const sorted = inOrg
      .map((v) => v.productions as unknown as { id: string; opening_date: string | null })
      .sort((a, b) => (a.opening_date || "9999").localeCompare(b.opening_date || "9999"));
    pid = sorted[0]?.id || null;
  }
  if (!pid) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10"><p className="text-body-md text-ash">No active production to build a playbill for.</p></div>;
  }

  const { data: prod } = await supabase
    .from("productions").select("id, title").eq("id", pid).maybeSingle();
  if (!prod) return null;

  const { error: ensureError, playbill } = await ensurePlaybill(pid, orgId);
  if (ensureError || !playbill) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10"><p className="text-body-md text-brick">{ensureError || "Couldn't open the playbill."}</p></div>;
  }

  const { data: credits } = await supabase
    .from("playbill_credits").select("*").eq("playbill_id", playbill.id).order("sort_order", { ascending: true });

  // Auto-pulled preview counts so leadership sees what will render automatically.
  const { data: castRows } = await supabase
    .from("production_assignments")
    .select("person_id, department")
    .eq("production_id", pid).eq("active", true);
  const castCount = new Set((castRows || []).filter((r) => r.department === "cast").map((r) => r.person_id)).size;
  const teamCount = new Set((castRows || []).filter((r) => r.department !== "cast").map((r) => r.person_id)).size;

  return (
    <PlaybillEditor
      productionId={pid}
      productionTitle={prod.title as string}
      orgId={orgId}
      playbill={playbill}
      credits={credits || []}
      castCount={castCount}
      teamCount={teamCount}
    />
  );
}
