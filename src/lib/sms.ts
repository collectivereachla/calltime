import crypto from "crypto";

// Normalize a stored phone string to E.164 US (+1XXXXXXXXXX). Returns null if
// it can't be made into a plausible 10/11-digit US number.
export function toE164US(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (trimmed.startsWith("+") && d.length >= 8) return "+" + d;
  return null;
}

// Send one SMS via the Twilio REST API (no SDK dependency — plain fetch with
// Basic auth). Prefers a Messaging Service (MG...) so A2P, opt-out, and sender
// pool are handled by Twilio; falls back to a single From number. Graceful
// no-op when unconfigured so the rest of a notification run still completes.
export async function sendSms({ to, body }: { to: string; body: string }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const msgService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || (!msgService && !from)) {
    return { error: "SMS not configured" };
  }
  const e164 = to.startsWith("+") ? to : toE164US(to);
  if (!e164) return { error: "Invalid destination number" };

  const params = new URLSearchParams();
  params.set("To", e164);
  params.set("Body", body);
  if (msgService) params.set("MessagingServiceSid", msgService);
  else params.set("From", from!);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("SMS send failed:", data?.message || res.status);
      return { error: data?.message || `HTTP ${res.status}` };
    }
    return { success: true, sid: data.sid as string };
  } catch (err) {
    console.error("SMS error:", err);
    return { error: "Failed to send SMS" };
  }
}

// Validate an inbound Twilio webhook signature (X-Twilio-Signature).
// Algorithm: HMAC-SHA1 over the full URL + alphabetically-sorted POST params
// (key then value, concatenated), keyed by the auth token, base64-encoded.
export function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) return false;
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const k of sorted) data += k + params[k];
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
