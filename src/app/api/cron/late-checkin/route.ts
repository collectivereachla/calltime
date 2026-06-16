import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Runs frequently, but self-scopes to the actual schedule: it only does work
// when at least one of today's call windows is open. A person's window runs
// from their effective call time until STOP_AFTER_MIN past it; leadership/late
// reminders stop then too. Outside every window the route exits immediately.
const LATE_AFTER_MIN = 5;
const STOP_AFTER_MIN = 45;

function centralParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const h = parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10) % 24;
  const m = parseInt(p.find((x) => x.type === "minute")?.value ?? "0", 10);
  return { date, minutesNow: h * 60 + m };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
  const { date: today, minutesNow } = centralParts();

  // Today's published events with a start time.
  const { data: events } = await supabase
    .from("schedule_events")
    .select("id, title, event_date, start_time, location, org_id, production_id, published, productions!inner ( title ), organizations!inner ( name )")
    .eq("event_date", today)
    .eq("published", true)
    .not("start_time", "is", null);

  if (!events || events.length === 0) {
    return NextResponse.json({ message: "No timed events today", sent: 0 });
  }
  const eventById = new Map(events.map((e) => [e.id, e]));
  const eventIds = events.map((e) => e.id);

  // Calls for today's events, not checked in, not already late-reminded.
  const { data: calls } = await supabase
    .from("event_calls")
    .select("id, event_id, person_id, call_time, checked_in_at, late_reminder_sent_at, people!inner ( full_name, preferred_name, email )")
    .in("event_id", eventIds)
    .is("checked_in_at", null)
    .is("late_reminder_sent_at", null);

  if (!calls || calls.length === 0) {
    return NextResponse.json({ message: "Nobody late", sent: 0 });
  }

  // These departments don't check in: leadership (directing, production, stage
  // management) plus designers and musicians. Never remind them. Drop their
  // calls before the late-window filter.
  const NO_CHECKIN_DEPTS = ["directing", "production", "stage_management", "design", "music"];
  const personIdsForRole = Array.from(new Set(calls.map((c) => c.person_id)));
  const leadershipSet = new Set<string>();
  const prodIds = Array.from(new Set(events.map((e) => e.production_id as string)));
  const { data: leadAssigns } = await supabase
    .from("production_assignments")
    .select("person_id, department")
    .in("production_id", prodIds)
    .eq("active", true)
    .in("person_id", personIdsForRole);
  for (const a of leadAssigns || []) {
    if (NO_CHECKIN_DEPTS.includes(a.department as string)) leadershipSet.add(a.person_id);
  }
  const eligibleCalls = calls.filter((c) => !leadershipSet.has(c.person_id));
  if (eligibleCalls.length === 0) {
    return NextResponse.json({ message: "No eligible (non-leadership) calls", sent: 0 });
  }

  // Keep only those inside their late window: 5+ minutes past their effective
  // call, but not more than 45 minutes past it. After 45 min we stop pinging.
  const lateCalls = eligibleCalls.filter((c) => {
    const ev = eventById.get(c.event_id)!;
    const eff = (c.call_time as string | null) || (ev.start_time as string | null);
    if (!eff) return false;
    const [h, m] = eff.split(":").map(Number);
    const callMin = h * 60 + m;
    const past = minutesNow - callMin;
    return past >= LATE_AFTER_MIN && past <= STOP_AFTER_MIN;
  });

  if (lateCalls.length === 0) {
    return NextResponse.json({ message: "No one in the late window", sent: 0 });
  }

  let personPings = 0;
  const stampIds: string[] = [];
  // Collect late people per org so leadership gets one summary alert.
  const lateByOrg = new Map<string, { orgName: string; names: string[] }>();

  for (const c of lateCalls) {
    const ev = eventById.get(c.event_id)!;
    const person = c.people as unknown as { full_name: string; preferred_name: string | null; email: string | null };
    const prod = ev.productions as unknown as { title: string };
    const eff = (c.call_time as string | null) || (ev.start_time as string | null);
    const [h, m] = (eff || "0:0").split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hr = h % 12 || 12;
    const timeStr = `${hr}:${String(m).padStart(2, "0")} ${period}`;
    const displayName = person.preferred_name || person.full_name.split(" ")[0];

    // Ping the late person: push + in-app.
    createNotification({
      personId: c.person_id,
      orgId: ev.org_id as string,
      type: "late_checkin",
      title: "You haven't checked in",
      body: `${ev.title} — your call was ${timeStr}. Check in with the stage manager.`,
      link: "/callboard",
    }).catch(() => {});

    // Email the late person.
    if (person.email) {
      const html = `
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1A1A1B">
          <h2 style="font-family:Newsreader,Georgia,serif;color:#C4522D;font-weight:600">Time to check in</h2>
          <p>Hi ${displayName},</p>
          <p>Your call for <strong>${ev.title}</strong> (${prod.title}) was at <strong>${timeStr}</strong>${ev.location ? ` at ${ev.location}` : ""}, and you haven't checked in yet.</p>
          <p>Please see the stage manager to check in as soon as you arrive.</p>
          <p style="margin-top:24px"><a href="${appUrl}/callboard" style="color:#C4522D">Open Callboard</a></p>
        </div>`;
      await sendEmail({
        to: person.email,
        subject: `Check in for ${ev.title} — your call was ${timeStr}`,
        html,
      });
    }

    personPings++;
    stampIds.push(c.id);

    const key = ev.org_id as string;
    if (!lateByOrg.has(key)) {
      lateByOrg.set(key, { orgName: (ev.organizations as unknown as { name: string }).name, names: [] });
    }
    lateByOrg.get(key)!.names.push(`${person.preferred_name || person.full_name} (${timeStr})`);
  }

  // Alert each org's production leadership with the list of late people.
  for (const [orgId, info] of lateByOrg) {
    const { data: leaders } = await supabase
      .from("org_memberships")
      .select("person_id, people!inner ( email, preferred_name, full_name )")
      .eq("org_id", orgId)
      .in("role", ["owner", "production", "admin"]);

    for (const l of leaders || []) {
      createNotification({
        personId: l.person_id,
        orgId,
        type: "late_checkin_sm",
        title: `${info.names.length} not checked in`,
        body: info.names.join(", "),
        link: "/callboard/kiosk",
      }).catch(() => {});
      const lp = l.people as unknown as { email: string | null; preferred_name: string | null; full_name: string };
      if (lp.email) {
        const html = `
          <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1A1A1B">
            <h2 style="font-family:Newsreader,Georgia,serif;color:#C4522D;font-weight:600">Not checked in</h2>
            <p>${info.names.length} ${info.names.length === 1 ? "person is" : "people are"} past call and not checked in:</p>
            <ul>${info.names.map((n) => `<li>${n}</li>`).join("")}</ul>
            <p style="margin-top:16px"><a href="${appUrl}/callboard/kiosk" style="color:#C4522D">Open Check-In</a></p>
          </div>`;
        await sendEmail({ to: lp.email, subject: `${info.names.length} not checked in — ${info.orgName}`, html });
      }
    }
  }

  // Stamp so we don't re-remind the same call next cycle.
  if (stampIds.length > 0) {
    await supabase
      .from("event_calls")
      .update({ late_reminder_sent_at: new Date().toISOString() })
      .in("id", stampIds);
  }

  return NextResponse.json({ message: "Late reminders sent", personPings, orgs: lateByOrg.size });
}
