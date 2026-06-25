import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import { RolodexClient } from "./rolodex-client";

export const dynamic = "force-dynamic";

export default async function RolodexPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId!)
    .single();

  const orgId = await resolveActingOrgId(person!.id);
  if (!orgId) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Rolodex</h1>
        <p className="text-body-md text-ash">Open a production to view the Rolodex.</p>
      </div>
    );
  }

  const role = await getRoleInOrg(person!.id, orgId);
  if (!isOwnerRole(role)) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Rolodex</h1>
        <p className="text-body-md text-ash">The Rolodex is owner-only.</p>
      </div>
    );
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data: contacts } = await supabase
    .from("contacts")
    .select(
      "id, type, full_name, email, phone, city, zip, tags, lifetime_total, steward_tier, subscribed, first_season, source, notes"
    )
    .eq("org_id", orgId)
    .order("lifetime_total", { ascending: false, nullsFirst: false })
    .order("full_name", { ascending: true });

  const { data: activity } = await supabase
    .from("contact_activity")
    .select(
      "contact_id, event_type, season, tickets_qty, tickets_amount, donation_amount, check_in_status, email_engagement, promo_code, platform, contacts!inner(org_id)"
    )
    .eq("contacts.org_id", orgId);

  return (
    <RolodexClient
      orgName={orgRow?.name ?? ""}
      contacts={contacts ?? []}
      activity={(activity ?? []) as unknown as ActivityRow[]}
    />
  );
}

type ActivityRow = {
  contact_id: string;
  event_type: string | null;
  season: number | null;
  tickets_qty: number | null;
  tickets_amount: number | null;
  donation_amount: number | null;
  check_in_status: string | null;
  email_engagement: string | null;
  promo_code: string | null;
  platform: string | null;
};
