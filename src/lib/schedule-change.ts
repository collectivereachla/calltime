import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { buildEventIcs, icsAttachment } from "@/lib/ics";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
const WINDOW_MS = 48 * 60 * 60 * 1000;

// Append rows to the schedule change log (powers the weekly "what changed"
// digest). Written via the service-role client so it works from any actor.
export async function logScheduleChanges(rows: {
  orgId: string;
  productionId?: string | null;
  personId: string;
  eventId?: string | null;
  changeType: "called" | "uncalled" | "moved" | "canceled" | "updated";
  summary: string;
  eventDate?: string | null;
}[]) {
  if (rows.length === 0) return;
  try {
    const admin = createAdminClient();
    await admin.from("schedule_change_log").insert(
      rows.map((r) => ({
        org_id: r.orgId,
        production_id: r.productionId ?? null,
        person_id: r.personId,
        event_id: r.eventId ?? null,
        change_type: r.changeType,
        summary: r.summary,
        event_date: r.eventDate ?? null,
      }))
    );
  } catch {
    /* fire-and-forget */
  }
}

// Wall-clock comparison in the org's timezone (Central). Both "now" and the
// event time are reduced to Central wall-clock ms, so the offset cancels out
// and the difference is correct in real hours without a TZ library.
function nowCentralMs() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })).getTime();
}
function eventCentralMs(dateISO: string, startTime: string | null) {
  const t = (startTime || "00:00").slice(0, 5);
  return new Date(`${dateISO}T${t}:00Z`).getTime();
}
function withinWindow(dateISO: string, startTime: string | null) {
  const diff = eventCentralMs(dateISO, startTime) - nowCentralMs();
  return diff <= WINDOW_MS && diff >= -2 * 60 * 60 * 1000;
}

function fmtDate(dateISO: string) {
  return new Date(dateISO + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m}${ampm}`;
}

export type ScheduleChangeKind = "moved" | "canceled" | "updated";

/**
 * Notify called people about a change to a PUBLISHED event, following the 48h
 * rule: inside the window → push + in-app (plus email on moves/cancellations,
 * and a re-opened confirmation on moves); outside the window → silent, because
 * the weekly digest carries it. No-op for drafts or empty call lists.
 */
export async function notifyScheduleChange(opts: {
  orgId: string;
  productionId?: string | null;
  eventId?: string | null;
  title: string;
  published: boolean;
  kind: ScheduleChangeKind;
  oldDate: string;
  oldStart: string | null;
  newDate: string;
  newStart: string | null;
  newLocation?: string | null;
  personIds: string[];
  eventCallIds?: string[]; // for re-opening confirmations on a move
  // Optional fields that enable an emailed .ics invite to accompany the change.
  productionTitle?: string | null;
  orgName?: string | null;
  eventType?: string | null;
  newEnd?: string | null;
  icsSequence?: number | null;
}) {
  if (!opts.published || opts.personIds.length === 0) return;

  const newWhen = `${fmtDate(opts.newDate)}${opts.newStart ? ` at ${fmtTime(opts.newStart)}` : ""}`;

  // Log the change for the weekly digest regardless of proximity, so far-out
  // changes (which get no real-time ping) still show up in Sunday's "what changed".
  let logSummary: string;
  if (opts.kind === "canceled") logSummary = `${opts.title} on ${fmtDate(opts.oldDate)} was canceled`;
  else if (opts.kind === "moved") logSummary = `${opts.title} moved to ${newWhen}`;
  else logSummary = `${opts.title} (${fmtDate(opts.newDate)}) details updated`;

  await logScheduleChanges(
    opts.personIds.map((pid) => ({
      orgId: opts.orgId,
      productionId: opts.productionId ?? null,
      personId: pid,
      eventId: opts.kind === "canceled" ? null : opts.eventId ?? null,
      changeType: opts.kind,
      summary: logSummary,
      eventDate: opts.kind === "canceled" ? opts.oldDate : opts.newDate,
    }))
  );

  const near =
    withinWindow(opts.oldDate, opts.oldStart) || withinWindow(opts.newDate, opts.newStart);

  const supabase = await createClient();

  // A move re-opens confirmation for this event's calls no matter how far out
  // it is: the time people agreed to has changed, so their old "confirmed" is
  // stale and they must be asked again. (The weekly digest carries the ask for
  // far-out moves; near moves also get the real-time ping below.)
  if (opts.kind === "moved" && opts.eventCallIds && opts.eventCallIds.length > 0) {
    await supabase.from("call_responses").delete().in("event_call_id", opts.eventCallIds);
    await supabase
      .from("event_calls")
      .update({ email_sent_at: new Date().toISOString(), nudge_sent_at: null })
      .in("id", opts.eventCallIds);
  }

  if (!near) return; // outside 48h — the weekly digest will carry it

  let title: string;
  let body: string;
  let emailSubject = "";
  let sendMail = false;

  if (opts.kind === "canceled") {
    title = "Call canceled";
    body = `${opts.title} — ${fmtDate(opts.oldDate)} is canceled`;
    emailSubject = `Canceled: ${opts.title} (${fmtDate(opts.oldDate)})`;
    sendMail = true;
  } else if (opts.kind === "moved") {
    title = "Call time changed";
    body = `${opts.title} — now ${newWhen}`;
    emailSubject = `Updated: ${opts.title} (${fmtDate(opts.newDate)})`;
    sendMail = true;
  } else {
    title = "Call updated";
    body = `${opts.title} — ${fmtDate(opts.newDate)}${opts.newLocation ? ` · ${opts.newLocation}` : ""}`;
    sendMail = false; // location/details: push + in-app only
  }

  for (const pid of opts.personIds) {
    createNotification({
      personId: pid,
      orgId: opts.orgId,
      type: "event_change",
      title,
      body,
      link: "/callboard",
    }).catch(() => {});
  }

  if (sendMail) {
    // Build the matching calendar invite once (REQUEST for a move, CANCEL for a
    // cancellation) when we have enough event detail. Stable UID + bumped
    // sequence makes calendars update the existing entry in place.
    const canIcs = !!(opts.eventId && opts.productionTitle && opts.orgName);
    const icsMethod = opts.kind === "canceled" ? "CANCEL" : "REQUEST";
    const icsDate = opts.kind === "canceled" ? opts.oldDate : opts.newDate;
    const icsStart = opts.kind === "canceled" ? opts.oldStart : opts.newStart;

    const { data: ppl } = await supabase
      .from("people")
      .select("id, full_name, preferred_name, email")
      .in("id", opts.personIds);
    for (const p of ppl || []) {
      if (!p.email) continue;
      const name = p.preferred_name || p.full_name.split(" ")[0];
      const html =
        `<p>Hi ${name},</p>` +
        `<p>${body}.</p>` +
        `<p><a href="${APP_URL}/callboard">Open the callboard</a> to review and confirm.</p>`;
      const attachments = canIcs
        ? [
            icsAttachment(
              buildEventIcs({
                eventId: opts.eventId!,
                title: opts.title,
                productionTitle: opts.productionTitle!,
                orgName: opts.orgName!,
                eventType: opts.eventType,
                date: icsDate,
                startTime: icsStart,
                endTime: opts.kind === "canceled" ? null : opts.newEnd ?? null,
                location: opts.newLocation,
                sequence: opts.icsSequence ?? 1,
                method: icsMethod,
                attendeeEmail: p.email,
              })
            ),
          ]
        : undefined;
      sendEmail({ to: p.email, subject: emailSubject, html, attachments }).catch(() => {});
    }
  }
}
