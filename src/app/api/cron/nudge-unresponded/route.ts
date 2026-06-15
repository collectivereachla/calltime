import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildNudgeEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Re-nudge cadence: re-send to a non-responder once their last nudge (or the
// original call email) is at least this old. The cron itself is scheduled on a
// 6-hour grid, so this keeps each person on a ~6-hour loop until they confirm
// or the call passes.
const RENUDGE_AFTER_HOURS = 6;
// Don't start nudging until the original call email has had time to land.
const FIRST_NUDGE_AFTER_HOURS = 6;
// Quiet hours in Central time: no sends from 21:00 through 07:59.
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;

function centralHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "numeric", hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(h, 10) % 24;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Respect quiet hours: skip the run entirely overnight.
  const hour = centralHour();
  const inQuiet = hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  if (inQuiet) {
    return NextResponse.json({ message: "Quiet hours — skipped", sent: 0 });
  }

  // Service-role client: this is a system send, and the embedded people/
  // production/org reads must not be filtered by RLS.
  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";

  const now = new Date();
  const firstCutoff = new Date(now.getTime() - FIRST_NUDGE_AFTER_HOURS * 3600 * 1000).toISOString();
  const reCutoff = new Date(now.getTime() - RENUDGE_AFTER_HOURS * 3600 * 1000).toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now); // YYYY-MM-DD

  // Candidate calls: published, email sent long enough ago, event not in the
  // past (date today or later), and either never nudged or last nudged > 6h ago.
  const { data: rows, error } = await supabase
    .from("event_calls")
    .select(`
      id, person_id, nudge_sent_at, nudge_count, call_time,
      people!inner ( id, full_name, preferred_name, email ),
      schedule_events!inner (
        title, event_type, event_date, start_time, end_time,
        published, org_id,
        productions!inner ( title ),
        organizations!inner ( name )
      )
    `)
    .not("email_sent_at", "is", null)
    .lte("email_sent_at", firstCutoff)
    .eq("schedule_events.published", true)
    .gte("schedule_events.event_date", today);

  if (error) {
    console.error("Nudge query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ message: "No nudges needed", sent: 0 });
  }

  // Keep only those due for a (re)nudge: never nudged, or last nudge > 6h ago.
  const dueRows = rows.filter((r) => {
    const last = r.nudge_sent_at as string | null;
    return !last || last <= reCutoff;
  });
  if (dueRows.length === 0) {
    return NextResponse.json({ message: "Nothing due this cycle", sent: 0 });
  }

  // Drop any whose effective call time has already passed today, so we never
  // nudge for a call that's already started.
  const nowCentralMin = (() => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now);
    const h = parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10) % 24;
    const m = parseInt(p.find((x) => x.type === "minute")?.value ?? "0", 10);
    return h * 60 + m;
  })();
  const stillUpcoming = dueRows.filter((r) => {
    const ev = r.schedule_events as unknown as { event_date: string; start_time: string | null; end_time: string | null };
    if (ev.event_date > today) return true; // future day
    if (ev.event_date < today) return false; // past day
    // Same day: keep until the effective end (or start) time has passed.
    const eff = (ev.end_time || (r.call_time as string | null) || ev.start_time);
    if (!eff) return true; // all-day event still counts today
    const [eh, em] = eff.split(":").map(Number);
    return eh * 60 + em >= nowCentralMin;
  });
  if (stillUpcoming.length === 0) {
    return NextResponse.json({ message: "Nothing upcoming due", sent: 0 });
  }

  // Filter to calls without a response.
  const callIds = stillUpcoming.map((r) => r.id);
  const { data: responded } = await supabase
    .from("call_responses")
    .select("event_call_id")
    .in("event_call_id", callIds);
  const respondedSet = new Set((responded || []).map((r) => r.event_call_id));
  const unresponded = stillUpcoming.filter((r) => !respondedSet.has(r.id));
  if (unresponded.length === 0) {
    return NextResponse.json({ message: "All due calls responded", sent: 0 });
  }

  // Group by person.
  type Ev = { title: string; date: string; startTime: string | null; productionTitle: string };
  const byPerson = new Map<string, {
    name: string; email: string | null; orgName: string; orgId: string;
    callIds: string[]; events: Ev[];
  }>();

  for (const row of unresponded) {
    const person = row.people as unknown as { id: string; full_name: string; preferred_name: string | null; email: string | null };
    const event = row.schedule_events as unknown as {
      title: string; event_date: string; start_time: string | null; org_id: string;
      productions: { title: string }; organizations: { name: string };
    };
    if (!byPerson.has(person.id)) {
      byPerson.set(person.id, {
        name: person.preferred_name || person.full_name.split(" ")[0],
        email: person.email,
        orgName: event.organizations.name,
        orgId: event.org_id,
        callIds: [], events: [],
      });
    }
    const entry = byPerson.get(person.id)!;
    entry.callIds.push(row.id);
    entry.events.push({
      title: event.title, date: event.event_date,
      startTime: event.start_time, productionTitle: event.productions.title,
    });
  }

  let emailed = 0, pushed = 0, failed = 0;
  const nudgedIds: string[] = [];

  for (const [personId, person] of byPerson) {
    const n = person.events.length;

    // Push + in-app (fires regardless of email deliverability).
    createNotification({
      personId,
      orgId: person.orgId,
      type: "call_nudge",
      title: `${n} call${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your response`,
      body: `Tap to confirm in Callboard.`,
      link: "/callboard",
    }).then(() => { pushed++; }).catch(() => {});

    // Email.
    if (person.email) {
      const html = buildNudgeEmail({
        name: person.name, orgName: person.orgName, events: person.events,
        callboardUrl: `${appUrl}/callboard`,
      });
      const result = await sendEmail({
        to: person.email,
        subject: `Reminder: ${n} call${n === 1 ? "" : "s"} need a response`,
        html,
      });
      if (result.error) {
        failed++;
        console.error(`Nudge email failed for ${person.email}:`, result.error);
      } else {
        emailed++;
      }
    }

    nudgedIds.push(...person.callIds);
  }

  // Re-stamp nudge time and bump the count for every call we nudged this cycle.
  if (nudgedIds.length > 0) {
    for (const id of nudgedIds) {
      try {
        await supabase.rpc("bump_nudge", { p_call_id: id });
      } catch (e) {
        console.error("bump_nudge failed:", id, e);
      }
    }
  }

  return NextResponse.json({
    message: "Nudge run complete",
    people: byPerson.size,
    emailed, pushed, failed,
  });
}
