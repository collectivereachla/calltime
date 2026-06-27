import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { PreviewBar } from "@/components/preview-bar";
import { getActiveProductionId } from "@/lib/active-production";
import { getViewer, getPreviewablePeople } from "@/lib/viewer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const viewer = await getViewer(supabase);
  if (!viewer.user) {
    redirect("/login");
  }
  if (!viewer.realPerson) {
    redirect("/onboarding");
  }

  // Auto-update production statuses based on dates (lightweight, only updates drifted rows)
  await supabase.rpc("refresh_production_statuses");

  const { isPreview, canPreview, previewCookiePresent } = viewer;
  // Effective identity — the previewed person when an owner is in preview,
  // otherwise the real signed-in person. The entire shell renders from this.
  const person = viewer.person!;
  const personId = viewer.personId!;

  const { data: membershipsRaw } = await supabase
    .from("org_memberships")
    .select("id, role, status, organizations(id, name, slug)")
    .eq("person_id", personId)
    .eq("status", "active");
  const memberships = membershipsRaw ?? [];

  if (!isPreview && memberships.length === 0) {
    redirect("/onboarding");
  }

  // Check if non-admin member needs to complete org profile
  const isAdminOrOwner = memberships.some((m) => m.role === "owner" || m.role === "admin");
  if (!isPreview && !isAdminOrOwner) {
    const firstOrg = memberships[0].organizations as unknown as { id: string };
    const { data: details } = await supabase
      .from("member_details")
      .select("id")
      .eq("person_id", personId)
      .eq("org_id", firstOrg.id)
      .maybeSingle();

    if (!details) {
      // Check if org actually has required fields
      const { data: org } = await supabase
        .from("organizations")
        .select("required_member_fields")
        .eq("id", firstOrg.id)
        .single();

      const required = (org?.required_member_fields as string[]) || [];
      if (required.length > 0) {
        redirect("/complete-profile");
      }
    }
  }

  const displayName = person.preferred_name || person.full_name || "";

  // Productions for the switcher, ACROSS every org. Leadership (owner/production)
  // sees all active shows in each org they lead; everyone sees every active show
  // they're personally assigned to, in any org. Deduped — never collapsed to one org.
  const ACTIVE_STATUSES = ["pre_production", "rehearsal", "tech", "in_run"];
  const leadershipOrgIds = memberships
    .filter((m) => m.role === "owner" || m.role === "production")
    .map((m) => (m.organizations as unknown as { id: string }).id);

  const prodMap = new Map<string, { id: string; title: string; status: string }>();

  if (leadershipOrgIds.length > 0) {
    const { data } = await supabase
      .from("productions")
      .select("id, title, status")
      .in("org_id", leadershipOrgIds)
      .in("status", ACTIVE_STATUSES)
      .order("opening_date", { ascending: true, nullsFirst: false });
    for (const pr of data || []) prodMap.set(pr.id, pr);
  }

  const { data: assignedProds } = await supabase
    .from("production_assignments")
    .select("productions!inner(id, title, status)")
    .eq("person_id", personId)
    .eq("active", true)
    .in("productions.status", ACTIVE_STATUSES);
  for (const a of assignedProds || []) {
    const pr = a.productions as unknown as { id: string; title: string; status: string } | null;
    if (pr) prodMap.set(pr.id, pr);
  }

  const productions = Array.from(prodMap.values());

  // Determine active production from cookie, defaulting to first
  let activeProductionId = await getActiveProductionId();
  if (!activeProductionId || !productions.find(p => p.id === activeProductionId)) {
    activeProductionId = productions[0]?.id || null;
  }

  // Count unread notifications + contracts awaiting countersign + pending applications
  const isOwner = memberships.some((m) => m.role === "owner");
  const isAdmin = memberships.some((m) => m.role === "owner" || m.role === "admin");
  let pendingCountersignCount = 0;
  let pendingApplicationsCount = 0;
  let unreadNotificationCount = 0;

  // Fetch locked rooms for active production
  let lockedRooms: string[] = [];
  if (activeProductionId) {
    const { data: prod } = await supabase
      .from("productions")
      .select("locked_rooms")
      .eq("id", activeProductionId)
      .single();
    lockedRooms = prod?.locked_rooms || [];
  }

  // Org-level hidden rooms (owner-configured "rooms we don't use"), for the org
  // the viewer is acting in. Hides nav entries org-wide; distinct from per-show locks.
  let hiddenRooms: string[] = [];
  {
    let actingOrgId: string | null = null;
    if (activeProductionId) {
      const { data: ap } = await supabase
        .from("productions").select("org_id").eq("id", activeProductionId).maybeSingle();
      actingOrgId = (ap?.org_id as string) ?? null;
    }
    if (!actingOrgId) {
      actingOrgId = (memberships[0]?.organizations as unknown as { id: string } | undefined)?.id ?? null;
    }
    if (actingOrgId) {
      const { data: orgRow } = await supabase
        .from("organizations").select("settings").eq("id", actingOrgId).maybeSingle();
      const st = (orgRow?.settings as { hidden_rooms?: string[] } | null) || {};
      hiddenRooms = Array.isArray(st.hidden_rooms) ? st.hidden_rooms : [];
    }
  }

  // Booth is the design/production team's room — hide it from cast in the nav.
  // (The Booth page enforces the same check server-side.)
  let boothAccess = memberships.some(
    (m) => m.role === "owner" || m.role === "production" || m.role === "admin"
  );
  if (!boothAccess && activeProductionId) {
    const { data: boothAssignments } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("person_id", personId)
      .eq("production_id", activeProductionId)
      .eq("active", true);
    boothAccess = (boothAssignments || []).some(
      (a) =>
        ["admin", "production", "staff"].includes(a.access_tier) ||
        ["design", "music"].includes(a.department)
    );
  }

  // Seating / front-of-house is run by production-tier leadership — owner,
  // production, stage management (SM/ASM), TD, and the House Manager — plus any
  // staff-tier FOH assignment on the active show. Cast (member tier) is excluded
  // so the guest/comp list isn't exposed. (The Seating page enforces the same
  // check server-side.)
  let seatingAccess = memberships.some(
    (m) => m.role === "owner" || m.role === "production" || m.role === "admin"
  );
  if (!seatingAccess && activeProductionId) {
    const { data: seatingAssignments } = await supabase
      .from("production_assignments")
      .select("access_tier")
      .eq("person_id", personId)
      .eq("production_id", activeProductionId)
      .eq("active", true);
    seatingAccess = (seatingAssignments || []).some((a) =>
      ["admin", "owner", "production", "staff"].includes(a.access_tier)
    );
  }

  if (isOwner) {
    const ownerOrgIds = memberships
      .filter((m) => m.role === "owner")
      .map((m) => (m.organizations as unknown as { id: string }).id);
    const { count: csCount } = await supabase
      .from("contracts")
      .select("id, productions!inner(org_id)", { count: "exact", head: true })
      .eq("status", "signed")
      .in("productions.org_id", ownerOrgIds);
    pendingCountersignCount = csCount || 0;
  }

  if (isAdmin) {
    const orgIds = memberships.filter((m) => m.role === "owner" || m.role === "admin").map((m) => (m.organizations as unknown as { id: string }).id);
    const { count: appCount } = await supabase
      .from("applications")
      .select("id, productions!inner(org_id)", { count: "exact", head: true })
      .eq("status", "submitted")
      .in("productions.org_id", orgIds);
    pendingApplicationsCount = appCount || 0;
  }

  const { count: notifCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .is("read_at", null);
  unreadNotificationCount = notifCount || 0;

  const previewPeople = canPreview
    ? await getPreviewablePeople(supabase, viewer.ownerOrgIds)
    : [];

  return (
    <div className="min-h-screen flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-card focus:bg-ink focus:px-4 focus:py-2 focus:text-paper focus:text-body-sm"
      >
        Skip to content
      </a>
      <AppNav
        displayName={displayName}
        orgs={memberships.map((m) => ({
          id: (m.organizations as unknown as { id: string; name: string; slug: string }).id,
          name: (m.organizations as unknown as { id: string; name: string; slug: string }).name,
          slug: (m.organizations as unknown as { id: string; name: string; slug: string }).slug,
          role: m.role,
        }))}
        badges={{ ledger: pendingCountersignCount, applications: pendingApplicationsCount }}
        notificationCount={unreadNotificationCount}
        productions={productions}
        activeProductionId={activeProductionId}
        lockedRooms={lockedRooms}
        hiddenRooms={hiddenRooms}
        isOwner={isOwner}
        boothAccess={boothAccess}
        seatingAccess={seatingAccess}
      />
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 pt-14 pb-16 md:pt-0 md:pb-0 focus:outline-none">
        <PreviewBar
          isPreview={isPreview}
          previewName={isPreview ? displayName ?? null : null}
          canPreview={canPreview}
          previewCookiePresent={previewCookiePresent}
          people={previewPeople}
        />
        {children}
      </main>
    </div>
  );
}
