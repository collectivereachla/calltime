// Build a single-event iCalendar invite for emailing (iMIP-style).
// Stable UID is anchored to the event id so updates/cancellations land on the
// same calendar entry instead of creating duplicates. SEQUENCE must increase
// on each revision for clients to accept the update.

const DOMAIN = "checkcalltime.art";
const ORGANIZER_EMAIL = process.env.CALENDAR_ORGANIZER_EMAIL || "calls@checkcalltime.art";

function icsStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function icsDate(date: string, time: string | null): string {
  const d = date.replace(/-/g, "");
  if (!time) return d;
  return `${d}T${time.replace(/:/g, "").slice(0, 6)}`;
}
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildEventIcs(opts: {
  eventId: string;
  title: string;
  productionTitle: string;
  orgName: string;
  eventType?: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location?: string | null;
  notes?: string | null;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  attendeeEmail?: string | null;
  timezone?: string | null;
}): string {
  const tz = opts.timezone || "America/Chicago";
  const uid = `${opts.eventId}@${DOMAIN}`;
  const summary = `${opts.title} — ${opts.productionTitle}`;
  const desc = [
    opts.productionTitle,
    opts.orgName,
    (opts.eventType || "").replace(/_/g, " "),
    opts.notes || "",
  ]
    .filter(Boolean)
    .join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calltime//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTAMP:${icsStamp()}`,
    `SEQUENCE:${opts.sequence}`,
    `ORGANIZER;CN=${esc(opts.orgName)}:mailto:${ORGANIZER_EMAIL}`,
    `SUMMARY:${esc(summary)}`,
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
  ];

  if (opts.attendeeEmail) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`
    );
  }

  if (opts.startTime) {
    lines.push(`DTSTART;TZID=${tz}:${icsDate(opts.date, opts.startTime)}`);
    if (opts.endTime) {
      lines.push(`DTEND;TZID=${tz}:${icsDate(opts.date, opts.endTime)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(opts.date, null)}`);
  }

  if (opts.location) lines.push(`LOCATION:${esc(opts.location)}`);
  lines.push(`DESCRIPTION:${esc(desc)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

// Encode an ICS string as a base64 email attachment payload.
export function icsAttachment(ics: string, filename = "calltime.ics") {
  return {
    filename,
    content: Buffer.from(ics, "utf-8").toString("base64"),
    contentType: 'text/calendar; method=REQUEST; charset=utf-8',
  };
}
