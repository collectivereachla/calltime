import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getActiveProductionId } from "@/lib/active-production";
import { AvailabilityCalendar } from "./availability-calendar";

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);

  const { data: conflicts } = await supabase
    .from("conflicts")
    .select("id, start_date, end_date, all_day, start_time, end_time, conflict_type, description, recurring_rule")
    .eq("person_id", personId!)
    .order("start_date", { ascending: true });

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

  // Dates already declared all-day single-day, so we don't double-prompt them.
  const declared = new Set<string>();
  for (const c of conflicts || []) if (c.all_day && (!c.end_date || c.end_date === c.start_date) && !c.recurring_rule) declared.add(c.start_date as string);

  // Inferred (soft) conflicts from past callboard responses the actor hasn't
  // declared yet — surfaced for one-tap confirmation. Feeds the schedule.
  const { data: inferredRows } = await supabase.rpc("get_inferred_conflicts");
  const seenDates = new Set<string>();
  const inferred: { date: string; title: string; status: string; reason: string | null }[] = [];
  for (const r of (inferredRows || []) as { event_date: string; title: string; status: string; reason: string | null }[]) {
    const d = r.event_date;
    if (declared.has(d) || seenDates.has(d)) continue;
    seenDates.add(d);
    inferred.push({ date: d, title: r.title, status: r.status, reason: r.reason });
  }

  return (
    <AvailabilityCalendar conflicts={conflicts || []} inferred={inferred} windowStart={windowStart} windowEnd={windowEnd} prodTitle={prodTitle} />
  );
}
