import { NextResponse } from "next/server";
import { sendEventCallEmails } from "@/lib/email-triggers";

export const dynamic = "force-dynamic";

// Send the real "you've been called" emails (with calendar invite + confirm
// buttons) for a specific set of events. Used to backfill calls that were
// published before the call-email path was fixed, so their email_sent_at is
// still null. sendEventCallEmails only emails calls where email_sent_at IS
// NULL, so this is safe to re-run: already-emailed people are skipped.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { eventIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventIds = body.eventIds || [];
  if (eventIds.length === 0) {
    return NextResponse.json({ error: "No eventIds provided" }, { status: 400 });
  }

  const results: { eventId: string; ok: boolean }[] = [];
  for (const id of eventIds) {
    try {
      await sendEventCallEmails(id);
      results.push({ eventId: id, ok: true });
    } catch (e) {
      console.error("send-event-calls failed for", id, e);
      results.push({ eventId: id, ok: false });
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({ message: "done", count: results.length, results });
}
