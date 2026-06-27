import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { GreenroomChat } from "./greenroom-chat";
import { resolveActingOrgId, getRoleInOrg, isLeadershipRole, canLeadOrgShows } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";

export default async function GreenroomPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, headshot_url")
    .eq("id", personId!)
    .single();

  // Resolve the org from the selected show (never an arbitrary membership).
  const orgId = await resolveActingOrgId(person!.id);
  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">Select a production to open its greenroom.</p>
      </div>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const orgName = org?.name ?? "";

  const role = await getRoleInOrg(person!.id, orgId);
  const canManage = isLeadershipRole(role) || (await canLeadOrgShows(person!.id, orgId));
  const isOrgMember = role !== null;

  // The production room only appears for the active show, and only if it belongs
  // to the resolved org.
  const activeProductionId = await getActiveProductionId();
  let productionId: string | null = null;
  let productionName: string | null = null;
  if (activeProductionId) {
    const { data: prod } = await supabase
      .from("productions")
      .select("id, title, org_id")
      .eq("id", activeProductionId)
      .maybeSingle();
    if (prod && prod.org_id === orgId) {
      productionId = prod.id as string;
      productionName = prod.title as string;
    }
  }

  // Org members reach the production room; so does anyone assigned to that show
  // (contestants/parents who aren't org members).
  let canSeeProduction = false;
  if (productionId) {
    if (isOrgMember) {
      canSeeProduction = true;
    } else {
      const { data: asg } = await supabase
        .from("production_assignments")
        .select("id")
        .eq("person_id", person!.id)
        .eq("production_id", productionId)
        .eq("active", true)
        .maybeSingle();
      canSeeProduction = !!asg;
    }
  }

  if (!isOrgMember && !canSeeProduction) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">You don&apos;t have a greenroom for the selected production yet.</p>
      </div>
    );
  }

  // Members for @mention autocomplete: org members + this production's assignees,
  // deduped, excluding self. RLS limits this to people the viewer may see.
  const mentionRows: { id: string; name: string }[] = [];
  {
    const { data: om } = await supabase
      .from("org_memberships")
      .select("people(id, full_name, preferred_name)")
      .eq("org_id", orgId)
      .eq("status", "active");
    for (const r of om || []) {
      const pp = r.people as unknown as { id: string; full_name: string; preferred_name: string | null } | null;
      if (pp) mentionRows.push({ id: pp.id, name: pp.preferred_name || pp.full_name });
    }
    if (productionId) {
      const { data: pa } = await supabase
        .from("production_assignments")
        .select("people(id, full_name, preferred_name)")
        .eq("production_id", productionId)
        .eq("active", true);
      for (const r of pa || []) {
        const pp = r.people as unknown as { id: string; full_name: string; preferred_name: string | null } | null;
        if (pp) mentionRows.push({ id: pp.id, name: pp.preferred_name || pp.full_name });
      }
    }
  }
  const mentionMembers = Array.from(new Map(mentionRows.map((m) => [m.id, m])).values())
    .filter((m) => m.id !== person!.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <GreenroomChat
      members={mentionMembers}
      orgId={orgId}
      orgName={orgName}
      productionId={productionId}
      productionName={productionName}
      canSeeOrg={isOrgMember}
      canSeeProduction={canSeeProduction}
      canManage={canManage}
      personId={person!.id}
      personName={person!.preferred_name || person!.full_name}
      personHeadshot={person!.headshot_url}
    />
  );
}
