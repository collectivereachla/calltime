import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// VAPID keys — hardcoded until env var copy-paste issues are resolved
const VAPID_PUBLIC_KEY = "BPUyNG3yyciBWEOL6FMCdQoEqfDqTwdYZCjQa5tb0taqDGBY_mXSJ9DRYVumPnCAKuHDxQFHIuv7AEY0IIP-j0M";
const VAPID_PRIVATE_KEY = "B0595fPC-B1bZwIQr_L3pzMbhmaf7jkaMl0Sn0S69cI";
const VAPID_SUBJECT = "mailto:collectivereachla@gmail.com";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured — push notifications disabled");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push notification to all devices registered for a person.
 * Silently handles failures (expired subscriptions are cleaned up).
 */
export async function sendPushNotification(
  personId: string,
  payload: PushPayload
) {
  if (!ensureVapid()) return;

  const supabase = createAdminClient();

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys_p256dh, keys_auth")
    .eq("person_id", personId);

  if (!subscriptions || subscriptions.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth,
          },
        },
        payloadStr
      )
    )
  );

  // Clean up expired/invalid subscriptions
  const expired: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        expired.push(subscriptions[i].id);
      }
    }
  });

  if (expired.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", expired);
  }
}
