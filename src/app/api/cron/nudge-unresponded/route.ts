import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildNudgeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Nudge window: only nudge if the call email was sent more than this many hours ago
const NUDGE_AFTER_HOURS = 24;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - NUDGE_AFTER_HOURS);

  // Find unresponded calls: email sent, not yet nudged, event still upcoming
  const { data: rows, error } = await supabase
    .from("event_calls")
    .select(
      `
      id,
      person_id,
      people!inner ( id, full_name, preferred_name, email ),
      schedule_events!inner (
        title, event_type, event_date, start_time,
        productions!inner ( title ),
        organizations!inner ( name )
      )
    `
    )
    .is("nudge_sent_at", null)
    .not("email_sent_at", "is", null)
    .lte("email_sent_at", cutoff.toISOString())
    .gte("schedule_events.event_date", new Date().toISOString().split("T")[0]);

  if (error) {
    console.error("Nudge query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ message: "No nudges needed", sent: 0 });
  }

  // Filter to only calls without a response
  const callIds = rows.map((r) => r.id);
  const { data: responded } = await supabase
    .from("call_responses")
    .select("event_call_id")
    .in("event_call_id", callIds);

  const respondedSet = new Set(
    (responded || []).map((r) => r.event_call_id)
  );

  const unresponded = rows.filter((r) => !respondedSet.has(r.id));
  if (unresponded.length === 0) {
    return NextResponse.json({ message: "All calls responded", sent: 0 });
  }

  // Group by person
  const byPerson = new Map<
    string,
    {
      name: string;
      email: string;
      orgName: string;
      callIds: string[];
      events: {
        title: string;
        date: string;
        startTime: string | null;
        productionTitle: string;
      }[];
    }
  >();

  for (const row of unresponded) {
    const person = row.people as unknown as {
      id: string;
      full_name: string;
      preferred_name: string | null;
      email: string | null;
    };
    const event = row.schedule_events as unknown as {
      title: string;
      event_date: string;
      start_time: string | null;
      productions: { title: string };
      organizations: { name: string };
    };

    if (!person.email) continue;

    if (!byPerson.has(person.id)) {
      byPerson.set(person.id, {
        name: person.preferred_name || person.full_name.split(" ")[0],
        email: person.email,
        orgName: event.organizations.name,
        callIds: [],
        events: [],
      });
    }

    const entry = byPerson.get(person.id)!;
    entry.callIds.push(row.id);
    entry.events.push({
      title: event.title,
      date: event.event_date,
      startTime: event.start_time,
      productionTitle: event.productions.title,
    });
  }

  let sent = 0;
  let failed = 0;
  const allNudgedIds: string[] = [];

  for (const [, person] of byPerson) {
    const html = buildNudgeEmail({
      name: person.name,
      orgName: person.orgName,
      events: person.events,
      callboardUrl: `${appUrl}/callboard`,
    });

    const result = await sendEmail({
      to: person.email,
      subject: `Reminder: ${person.events.length} call${person.events.length === 1 ? "" : "s"} need a response`,
      html,
    });

    if (result.error) {
      failed++;
      console.error(`Nudge failed for ${person.email}:`, result.error);
    } else {
      sent++;
      allNudgedIds.push(...person.callIds);
    }
  }

  // Mark nudged
  if (allNudgedIds.length > 0) {
    await supabase
      .from("event_calls")
      .update({ nudge_sent_at: new Date().toISOString() })
      .in("id", allNudgedIds);
  }

  return NextResponse.json({
    message: "Nudge run complete",
    sent,
    failed,
    total: byPerson.size,
  });
}
