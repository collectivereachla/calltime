import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getActiveProductionId } from "@/lib/active-production";
import { KioskBoard } from "./kiosk-board";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);

  const activeProductionId = await getActiveProductionId();
  if (!activeProductionId) {
    return (
      <div className="p-8 text-center">
        <p className="text-body-md text-ash">Pick a production first, then open Check-In.</p>
        <Link href="/callboard" className="text-brick underline">Back to Callboard</Link>
      </div>
    );
  }

  const { data: prod } = await supabase
    .from("productions")
    .select("id, title, org_id")
    .eq("id", activeProductionId)
    .maybeSingle();
  if (!prod) return null;

  // Operator must be production leadership in this org.
  const { data: mem } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", personId!)
    .eq("org_id", prod.org_id)
    .maybeSingle();
  const canRun = mem && ["owner", "production", "admin"].includes(mem.role as string);
  if (!canRun) {
    return (
      <div className="p-8 text-center">
        <p className="text-body-md text-ash">Check-In is for stage management and production staff.</p>
        <Link href="/callboard" className="text-brick underline">Back to Callboard</Link>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // Today's published events for this production.
  const { data: events } = await supabase
    .from("schedule_events")
    .select("id, title, event_type, event_date, start_time, end_time, location, published")
    .eq("production_id", activeProductionId)
    .eq("event_date", today)
    .eq("published", true)
    .order("start_time", { ascending: true, nullsFirst: true });

  const eventIds = (events || []).map((e) => e.id);

  // All calls for today's events with person + effective time + check-in state.
  let calls: {
    id: string; event_id: string; person_id: string; call_time: string | null;
    checked_in_at: string | null; name: string; role: string | null;
  }[] = [];
  if (eventIds.length > 0) {
    const { data: callRows } = await supabase
      .from("event_calls")
      .select("id, event_id, person_id, call_time, checked_in_at, people!inner ( full_name, preferred_name )")
      .in("event_id", eventIds);

    // Role titles for display, and to exclude leadership. Cast and crew check
    // in; the leadership departments (directing, production, stage management)
    // run the show and don't check themselves in.
    const LEADERSHIP_DEPTS = ["directing", "production", "stage_management"];
    const personIds = Array.from(new Set((callRows || []).map((c) => c.person_id)));
    const roleByPerson = new Map<string, string>();
    const leadershipPersonIds = new Set<string>();
    if (personIds.length > 0) {
      const { data: assigns } = await supabase
        .from("production_assignments")
        .select("person_id, role_title, department")
        .eq("production_id", activeProductionId)
        .eq("active", true)
        .in("person_id", personIds);
      for (const a of assigns || []) {
        if (a.role_title && !roleByPerson.has(a.person_id)) roleByPerson.set(a.person_id, a.role_title as string);
        if (LEADERSHIP_DEPTS.includes(a.department as string)) leadershipPersonIds.add(a.person_id);
      }
    }

    calls = (callRows || [])
      .filter((c) => !leadershipPersonIds.has(c.person_id))
      .map((c) => {
        const p = c.people as unknown as { full_name: string; preferred_name: string | null };
        return {
          id: c.id, event_id: c.event_id, person_id: c.person_id,
          call_time: c.call_time, checked_in_at: c.checked_in_at,
          name: p.preferred_name || p.full_name,
          role: roleByPerson.get(c.person_id) || null,
        };
      });
  }

  return (
    <KioskBoard
      productionTitle={prod.title as string}
      orgId={prod.org_id as string}
      today={today}
      events={(events || []).map((e) => ({
        id: e.id, title: e.title as string, eventType: e.event_type as string,
        startTime: e.start_time as string | null, endTime: e.end_time as string | null,
        location: e.location as string | null,
      }))}
      calls={calls}
    />
  );
}
