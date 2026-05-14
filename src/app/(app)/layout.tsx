import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";

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
    .select("id, role, organizations(id, name, slug)")
    .eq("person_id", person.id);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const displayName = person.preferred_name || person.full_name;

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
      />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
