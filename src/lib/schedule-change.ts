import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
const WINDOW_MS = 48 * 60 * 60 * 1000;

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
}) {
  if (!opts.published || opts.personIds.length === 0) return;

  const near =
    withinWindow(opts.oldDate, opts.oldStart) || withinWindow(opts.newDate, opts.newStart);
  if (!near) return; // outside 48h — the weekly digest will carry it

  const newWhen = `${fmtDate(opts.newDate)}${opts.newStart ? ` at ${fmtTime(opts.newStart)}` : ""}`;

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

  const supabase = await createClient();

  if (sendMail) {
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
      sendEmail({ to: p.email, subject: emailSubject, html }).catch(() => {});
    }
  }

  // A move re-opens confirmation for just this event's calls: clear their
  // responses and reset nudge tracking so they're asked again.
  if (opts.kind === "moved" && opts.eventCallIds && opts.eventCallIds.length > 0) {
    await supabase.from("call_responses").delete().in("event_call_id", opts.eventCallIds);
    await supabase
      .from("event_calls")
      .update({ email_sent_at: new Date().toISOString(), nudge_sent_at: null })
      .in("id", opts.eventCallIds);
  }
}
