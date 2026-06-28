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

  // Inferred (soft) conflicts from past callboard responses the actor hasn't
  // declared yet — surfaced for one-tap confirmation. Feeds the schedule.
  const { data: inferredRows } = await supabase.rpc("get_inferred_conflicts");
  const seenDates = new Set<string>();
  const inferred: { date: string; title: string; status: string; reason: string | null }[] = [];
  for (const r of (inferredRows || []) as { event_date: string; title: string; status: string; reason: string | null }[]) {
    const d = r.event_date;
    if (marked[d] || seenDates.has(d)) continue;
    seenDates.add(d);
    inferred.push({ date: d, title: r.title, status: r.status, reason: r.reason });
  }

  return (
    <AvailabilityCalendar marked={marked} inferred={inferred} windowStart={windowStart} windowEnd={windowEnd} prodTitle={prodTitle} />
  );
}
