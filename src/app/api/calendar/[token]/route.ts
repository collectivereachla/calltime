import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface CalendarEvent {
  event_title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  production_title: string;
  org_name: string;
}

function formatICSDate(date: string, time: string | null): string {
  const d = date.replace(/-/g, "");
  if (!time) return d;
  const t = time.replace(/:/g, "").slice(0, 6);
  return `${d}T${t}`;
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return new NextResponse("Invalid token", { status: 400 });
  }

  const supabase = await createClient();

  const { data: events, error } = await supabase.rpc("get_calendar_events", {
    p_token: token,
  });

  if (error) {
    return new NextResponse("Calendar not found", { status: 404 });
  }

  const calEvents = (events as CalendarEvent[]) || [];

  // Build ICS
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calltime//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Calltime",
    "X-WR-TIMEZONE:America/Chicago",
  ];

  for (const event of calEvents) {
    const uid = `${event.event_date}-${event.event_title.replace(/\s/g, "")}-${event.production_title.replace(/\s/g, "")}@checkcalltime.art`;
    const summary = `${event.event_title} — ${event.production_title}`;
    const description = [
      event.production_title,
      event.org_name,
      event.event_type.replace(/_/g, " "),
      event.notes || "",
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeICS(uid)}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);

    if (event.start_time) {
      lines.push(
        `DTSTART;TZID=America/Chicago:${formatICSDate(event.event_date, event.start_time)}`
      );
      if (event.end_time) {
        lines.push(
          `DTEND;TZID=America/Chicago:${formatICSDate(event.event_date, event.end_time)}`
        );
      }
    } else {
      // All-day event
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(event.event_date, null)}`);
    }

    if (event.location) {
      lines.push(`LOCATION:${escapeICS(event.location)}`);
    }
    lines.push(`DESCRIPTION:${description}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n");

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="calltime.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
