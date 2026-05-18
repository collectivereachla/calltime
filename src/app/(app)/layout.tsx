import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { PushRegistration } from "@/components/push-registration";

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
    redirect("/directory");
  }

  const displayName = person.preferred_name || person.full_name;

  // Count unread notifications + contracts awaiting countersign
  const isOwner = memberships.some((m) => m.role === "owner");
  let pendingCountersignCount = 0;
  let unreadNotificationCount = 0;

  if (isOwner) {
    const { count: csCount } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "signed");
    pendingCountersignCount = csCount || 0;
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
        badges={{ ledger: pendingCountersignCount }}
        notificationCount={unreadNotificationCount}
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
