import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { PushRegistration } from "@/components/push-registration";
import { getActiveProductionId } from "@/lib/active-production";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Auto-update production statuses based on dates (lightweight, only updates drifted rows)
  await supabase.rpc("refresh_production_statuses");

  // Check if user has a person record and org membership
  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name")
    .eq("user_id", user.id)
    .single();

  if (!person) {
    redirect("/onboarding");
  }

  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("id, role, status, organizations(id, name, slug)")
    .eq("person_id", person.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  // Check if non-admin member needs to complete org profile
  const isAdminOrOwner = memberships.some((m) => m.role === "owner" || m.role === "admin");
  if (!isAdminOrOwner) {
    const firstOrg = memberships[0].organizations as unknown as { id: string };
    const { data: details } = await supabase
      .from("member_details")
      .select("id")
      .eq("person_id", person.id)
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

  const displayName = person.preferred_name || person.full_name;

  // Fetch user's productions for the switcher
  const orgId = (memberships[0].organizations as unknown as { id: string }).id;
  let productions: { id: string; title: string; status: string }[] = [];

  if (isAdminOrOwner) {
    // Owners/admins see all active productions in the org
    const { data } = await supabase
      .from("productions")
      .select("id, title, status")
      .eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true, nullsFirst: false });
    productions = data || [];
  } else {
    // Members only see productions they're assigned to
    const { data } = await supabase
      .from("production_assignments")
      .select("productions!inner(id, title, status)")
      .eq("person_id", person.id)
      .eq("active", true)
      .in("productions.status", ["pre_production", "rehearsal", "tech", "in_run"]);

    productions = (data || []).map(
      (a) => a.productions as unknown as { id: string; title: string; status: string }
    );
  }

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

  if (isOwner) {
    const { count: csCount } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "signed");
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
    .eq("person_id", person.id)
    .is("read_at", null);
  unreadNotificationCount = notifCount || 0;

  return (
    <div className="min-h-screen flex">
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
        isOwner={isOwner}
      />
      <main className="flex-1 min-w-0 pt-14 pb-16 md:pt-0 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-6">
          <PushRegistration />
        </div>
        {children}
      </main>
    </div>
  );
}
