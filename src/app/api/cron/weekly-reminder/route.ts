import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildWeeklyReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Get the coming week's schedule
  const today = new Date();
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + 7);

  const { data: schedule, error } = await supabase.rpc("get_weekly_schedule", {
    p_start_date: today.toISOString().split("T")[0],
    p_end_date: nextSunday.toISOString().split("T")[0],
  });

  if (error) {
    console.error("Failed to get weekly schedule:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!schedule || schedule.length === 0) {
    return NextResponse.json({ message: "No events this week", sent: 0 });
  }

  // Group events by person
  const byPerson = new Map<
    string,
    {
      name: string;
      email: string;
      orgName: string;
      events: {
        title: string;
        date: string;
        startTime: string | null;
        endTime: string | null;
        location: string | null;
        productionTitle: string;
      }[];
      unresponded: number;
    }
  >();

  for (const row of schedule) {
    if (!row.person_email) continue;

    if (!byPerson.has(row.person_id)) {
      byPerson.set(row.person_id, {
        name: row.person_name,
        email: row.person_email,
        orgName: row.org_name,
        events: [],
        unresponded: 0,
      });
    }

    const person = byPerson.get(row.person_id)!;
    person.events.push({
      title: row.event_title,
      date: row.event_date,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location,
      productionTitle: row.production_title,
    });

    if (!row.has_responded) {
      person.unresponded++;
    }
  }

  // Send emails
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
  let sent = 0;
  let failed = 0;

  for (const [, person] of byPerson) {
    const html = buildWeeklyReminderEmail({
      name: person.name,
      orgName: person.orgName,
      events: person.events,
      callboardUrl: `${appUrl}/callboard`,
    });

    const subject =
      person.unresponded > 0
        ? `Your week — ${person.unresponded} call${person.unresponded === 1 ? "" : "s"} need a response`
        : `Your week — ${person.events.length} call${person.events.length === 1 ? "" : "s"}`;

    const result = await sendEmail({
      to: person.email,
      subject,
      html,
    });

    if (result.error) {
      failed++;
      console.error(`Failed to email ${person.email}:`, result.error);
    } else {
      sent++;
    }
  }

  return NextResponse.json({
    message: `Weekly reminders sent`,
    sent,
    failed,
    total: byPerson.size,
  });
}
