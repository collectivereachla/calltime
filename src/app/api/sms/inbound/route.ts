import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/sms";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://checkcalltime.art";
const SUPPORT = "josiahmprice@gmail.com";

function twiml(message?: string) {
  const body = message
    ? `<Response><Message>${message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</Message></Response>`
    : `<Response></Response>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP", "RESUME", "OPTIN"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const CONFIRM_WORDS = new Set(["C", "CONFIRM", "CONFIRMED", "OK", "OKAY", "Y", "YEP", "YUP", "YEAH", "HERE"]);

export async function POST(request: Request) {
  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = v));

  const from = params["From"] || "";
  const bodyText = (params["Body"] || "").trim();
  const word = bodyText.toUpperCase().replace(/[^A-Z]/g, "");

  // Verify the request really came from Twilio before doing anything.
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const sig = request.headers.get("x-twilio-signature");
    const url = `${APP_URL}/api/sms/inbound`;
    if (!validateTwilioSignature(token, sig, url, params)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const supabase = createAdminClient();

  // STOP: opt the number's owner out. (Twilio also enforces this at the carrier
  // level; we mirror it so the app's own state stays correct.)
  if (STOP_WORDS.has(word)) {
    await supabase.rpc("sms_set_opt_out", { p_from: from }).then(() => {}, () => {});
    return twiml("You're unsubscribed from Calltime texts. No more messages will be sent. Reply START to resubscribe.");
  }

  // HELP.
  if (HELP_WORDS.has(word)) {
    return twiml(`Calltime call-time reminders. About 4-6 msgs/month. Msg & data rates may apply. Reply STOP to cancel. Help: ${SUPPORT}`);
  }

  // START / resubscribe.
  if (START_WORDS.has(word) && word !== "YES") {
    return twiml("You're resubscribed to Calltime texts. To fully manage reminders, open Settings at " + APP_URL + "/settings");
  }

  // Anything else is treated as a confirmation ("C", "yes", "ok", or freeform).
  if (CONFIRM_WORDS.has(word) || bodyText.length > 0) {
    const { data } = await supabase.rpc("sms_confirm_calls", { p_from: from });
    const r = (data || {}) as { matched?: boolean; name?: string; confirmed?: number };
    if (!r.matched) {
      return twiml(`We couldn't match this number to a Calltime account. Reply HELP for help, or manage your calls at ${APP_URL}/callboard`);
    }
    const n = r.confirmed ?? 0;
    const name = r.name ? r.name + ", " : "";
    if (n > 0) {
      return twiml(`Thanks ${name}${n} call${n === 1 ? "" : "s"} confirmed. See you there. Manage calls: ${APP_URL}/callboard`);
    }
    return twiml(`Thanks ${name}you have nothing awaiting confirmation right now. View your calls: ${APP_URL}/callboard`);
  }

  return twiml();
}
