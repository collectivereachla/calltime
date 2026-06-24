import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getActiveProductionId } from "@/lib/active-production";
import { AvailabilityCalendar } from "./availability-calendar";

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);

  const { data: conflicts } = await supabase
    .from("conflicts")
    .select("id, start_date, all_day")
    .eq("person_id", personId!)
    .eq("all_day", true);

  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let prodTitle: string | null = null;
  const activeProductionId = await getActiveProductionId();
  if (activeProductionId) {
    const { data: prod } = await supabase
      .from("productions")
      .select("title, first_rehearsal, closing_date")
      .eq("id", activeProductionId)
      .maybeSingle();
    if (prod) {
      prodTitle = prod.title as string;
      windowStart = (prod.first_rehearsal as string) || null;
      windowEnd = (prod.closing_date as string) || null;
    }
  }

  const marked: Record<string, string> = {};
  for (const c of conflicts || []) marked[c.start_date as string] = c.id as string;

  return (
    <AvailabilityCalendar marked={marked} windowStart={windowStart} windowEnd={windowEnd} prodTitle={prodTitle} />
  );
}
