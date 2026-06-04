import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { resolveActingOrgId } from "@/lib/membership";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";
import { AdminTools } from "./admin-tools";
import { OrgSettings } from "./org-settings";
import { ConflictsForm } from "./conflicts-form";
import { NotificationSettings } from "./notification-settings";
import { W9Card } from "./w9-card";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, full_name, preferred_name, pronouns, email, phone, bio, birth_month, birth_day, is_minor"
    )
    .eq("id", personId!)
    .single();

  if (!person) redirect("/onboarding");

  const { data: ownership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("person_id", person.id)
    .eq("role", "owner");

  const isOwner = ownership && ownership.length > 0;

  // Get active production for room lock settings
  let activeProduction: { id: string; title: string; locked_rooms: string[] } | null = null;
  if (isOwner) {
    const { getActiveProductionId } = await import("@/lib/active-production");
    const activeId = await getActiveProductionId();
    if (activeId) {
      const { data } = await supabase
        .from("productions")
        .select("id, title, locked_rooms")
        .eq("id", activeId)
        .single();
      activeProduction = data;
    }
  }

  // Fetch org details for org settings
  let orgData: { id: string; name: string; slug: string; description: string | null; city: string | null; state: string | null; website: string | null; logo_url: string | null } | null = null;
  if (isOwner && ownership.length > 0) {
    const { data } = await supabase
      .from("organizations")
      .select("id, name, slug, description, city, state, website, logo_url")
      .eq("id", ownership[0].org_id)
      .single();
    orgData = data;
  }

  // Fetch user's conflicts
  const { data: conflicts } = await supabase
    .from("conflicts")
    .select("*")
    .eq("person_id", person.id)
    .order("start_date", { ascending: true });

  // W-9 status (member's own, in their org)
  const w9OrgId = await resolveActingOrgId(person.id);
  let w9TaxYear: number | null = null;
  let w9SubmittedAt: string | null = null;
  if (w9OrgId) {
    const { data: w9row } = await supabase
      .from("member_details")
      .select("w9_tax_year, w9_submitted_at")
      .eq("person_id", person.id)
      .eq("org_id", w9OrgId)
      .maybeSingle();
    w9TaxYear = w9row?.w9_tax_year ?? null;
    w9SubmittedAt = w9row?.w9_submitted_at ?? null;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 md:px-0">
      <h1 className="font-display text-display-lg text-ink mb-1">Settings</h1>
      <p className="text-body-sm text-ash mb-8">
        Manage your profile and account.
      </p>

      <SettingsForm person={person} userEmail={user.email || ""} />

      <div className="mt-10 pt-8 border-t border-bone">
        <ConflictsForm conflicts={conflicts || []} />
      </div>

      <W9Card w9TaxYear={w9TaxYear} submittedAt={w9SubmittedAt} />

      <div className="mt-10 pt-8 border-t border-bone">
        <NotificationSettings personId={person.id} />
      </div>

      {isOwner && orgData && <OrgSettings org={orgData} />}

      {isOwner && (
        <div className="mt-10">
          <AdminTools activeProduction={activeProduction} />
        </div>
      )}
    </div>
  );
}
