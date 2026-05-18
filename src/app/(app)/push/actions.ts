"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return { error: "No person record" };

  // Upsert — same person + endpoint = update, otherwise insert
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      person_id: person.id,
      endpoint: subscription.endpoint,
      keys_p256dh: subscription.keys.p256dh,
      keys_auth: subscription.keys.auth,
      user_agent: subscription.userAgent || null,
    },
    { onConflict: "person_id,endpoint" }
  );

  if (error) return { error: error.message };
  return { success: true };
}
