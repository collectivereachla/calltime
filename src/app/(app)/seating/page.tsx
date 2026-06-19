import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";
import { SeatingRoom } from "./seating-room";

export const dynamic = "force-dynamic";

export default async function SeatingPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);
  const activeProductionId = await getActiveProductionId();

  const empty = (msg: string) => (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-md mb-2">Seating</h1>
      <p className="text-body-md text-ash">{msg}</p>
    </div>
  );

  if (!activeProductionId) return empty("No active production selected.");

  const { data: production } = await supabase
    .from("productions")
    .select("id, title, org_id")
    .eq("id", activeProductionId)
    .single();
  if (!production) return empty("Production not found.");

  const role = personId ? await getRoleInOrg(personId, production.org_id as string) : null;
  const canEdit = isLeadershipRole(role);

  // Front-of-house room: owner/production org role, or a production/staff-tier
  // assignment on this show (Stage Management, TD, House Manager, FOH staff).
  // Cast (member tier) is kept out so the guest/comp list isn't exposed. This
  // mirrors the nav's seatingAccess gate so the page can't be reached by URL
  // when the link is hidden.
  let canAccess = canEdit;
  if (!canAccess && personId) {
    const { data: assigns } = await supabase
      .from("production_assignments")
      .select("access_tier")
      .eq("person_id", personId)
      .eq("production_id", activeProductionId)
      .eq("active", true);
    canAccess = (assigns || []).some((a) =>
      ["admin", "owner", "production", "staff"].includes(a.access_tier as string)
    );
  }
  if (!canAccess) {
    return empty("Seating is run by the front-of-house and production team.");
  }

  const { data: tables } = await supabase
    .from("seating_tables")
    .select("id, number, name, capacity, x, y, amount, source, status")
    .eq("production_id", activeProductionId)
    .order("number");

  const { data: guests } = await supabase
    .from("seating_guests")
    .select("id, name, party_size, amount, source, status, table_id, notes, checked_in, event_tag")
    .eq("production_id", activeProductionId)
    .order("created_at");

  const { data: settings } = await supabase
    .from("seating_settings")
    .select("price_per_seat")
    .eq("production_id", activeProductionId)
    .maybeSingle();

  // Performances from the Callboard — each gets its own seat map.
  const { data: performances } = await supabase
    .from("schedule_events")
    .select("id, title, event_date, start_time")
    .eq("production_id", activeProductionId)
    .eq("event_type", "performance")
    .order("event_date")
    .order("start_time");

  return (
    <SeatingRoom
      productionId={activeProductionId}
      productionTitle={production.title as string}
      canEdit={canEdit}
      initialTables={tables || []}
      initialGuests={guests || []}
      initialPrice={settings?.price_per_seat != null ? String(settings.price_per_seat) : ""}
      performances={(performances || []) as { id: string; title: string; event_date: string; start_time: string | null }[]}
    />
  );
}
