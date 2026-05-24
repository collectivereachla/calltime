"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function savePushSubscription(
  personId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  }
) {
  try {
    const admin = createAdminClient();

    const { error } = await admin.from("push_subscriptions").upsert(
      {
        person_id: personId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        user_agent: subscription.userAgent || null,
      },
      { onConflict: "person_id,endpoint" }
    );

    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
