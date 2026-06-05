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

  const { data: tables } = await supabase
    .from("seating_tables")
    .select("id, number, name, capacity, x, y, amount, source, status")
    .eq("production_id", activeProductionId)
    .order("number");

  const { data: guests } = await supabase
    .from("seating_guests")
    .select("id, name, party_size, amount, source, status, table_id, notes, checked_in")
    .eq("production_id", activeProductionId)
    .order("created_at");

  const { data: settings } = await supabase
    .from("seating_settings")
    .select("price_per_seat")
    .eq("production_id", activeProductionId)
    .maybeSingle();

  return (
    <SeatingRoom
      productionId={activeProductionId}
      productionTitle={production.title as string}
      canEdit={canEdit}
      initialTables={tables || []}
      initialGuests={guests || []}
      initialPrice={settings?.price_per_seat != null ? String(settings.price_per_seat) : ""}
    />
  );
}
