import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Group events by person (schedule may be empty; changes can still go out)
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

  for (const row of schedule || []) {
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

  // Merge in unsent schedule changes (the "what changed" section).
  const admin = createAdminClient();
  const { data: changeRows } = await admin
    .from("schedule_change_log")
    .select("id, person_id, summary, org_id")
    .is("digest_sent_at", null);

  const changesByPerson = new Map<string, { ids: string[]; summaries: string[]; orgId: string }>();
  for (const c of changeRows || []) {
    const e: { ids: string[]; summaries: string[]; orgId: string } =
      changesByPerson.get(c.person_id) || { ids: [], summaries: [], orgId: c.org_id as string };
    e.ids.push(c.id as string);
    e.summaries.push(c.summary as string);
    changesByPerson.set(c.person_id, e);
  }

  // People with changes but no events this week still get a digest.
  const missing = [...changesByPerson.keys()].filter((id) => !byPerson.has(id));
  if (missing.length > 0) {
    const { data: ppl } = await admin
      .from("people").select("id, full_name, preferred_name, email").in("id", missing);
    const orgIds = [...new Set(missing.map((id) => changesByPerson.get(id)!.orgId))];
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds);
    const orgName = new Map((orgs || []).map((o) => [o.id, o.name]));
    for (const p of ppl || []) {
      if (!p.email) continue;
      const orgId = changesByPerson.get(p.id)!.orgId;
      byPerson.set(p.id, {
        name: p.preferred_name || p.full_name,
        email: p.email,
        orgName: orgName.get(orgId) || "Calltime",
        events: [],
        unresponded: 0,
      });
    }
  }

  if (byPerson.size === 0) {
    return NextResponse.json({ message: "Nothing to send", sent: 0 });
  }

  // Send emails
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
  let sent = 0;
  let failed = 0;
  const sentChangeIds: string[] = [];

  for (const [personId, person] of byPerson) {
    const changes = changesByPerson.get(personId)?.summaries || [];
    if (person.events.length === 0 && changes.length === 0) continue;

    const html = buildWeeklyReminderEmail({
      name: person.name,
      orgName: person.orgName,
      events: person.events,
      callboardUrl: `${appUrl}/callboard`,
      changes,
      unresponded: person.unresponded,
    });

    const parts: string[] = [];
    if (changes.length > 0) parts.push(`${changes.length} update${changes.length === 1 ? "" : "s"}`);
    if (person.unresponded > 0) parts.push(`${person.unresponded} to confirm`);
    const subject =
      parts.length > 0
        ? `Your week — ${parts.join(", ")}`
        : `Your week — ${person.events.length} call${person.events.length === 1 ? "" : "s"}`;

    const result = await sendEmail({ to: person.email, subject, html });

    if (result.error) {
      failed++;
      console.error(`Failed to email ${person.email}:`, result.error);
    } else {
      sent++;
      sentChangeIds.push(...(changesByPerson.get(personId)?.ids || []));
    }
  }

  // Mark the changes we just summarized as digested.
  if (sentChangeIds.length > 0) {
    await admin
      .from("schedule_change_log")
      .update({ digest_sent_at: new Date().toISOString() })
      .in("id", sentChangeIds);
  }

  return NextResponse.json({
    message: `Weekly reminders sent`,
    sent,
    failed,
    total: byPerson.size,
  });
}
