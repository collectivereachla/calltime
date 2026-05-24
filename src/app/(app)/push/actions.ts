"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}) {
  console.log("savePushSubscription called:", subscription.endpoint.slice(0, 50));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) { console.log("savePushSubscription: no user"); return { error: "Not authenticated" }; }

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) { console.log("savePushSubscription: no person"); return { error: "No person record" }; }

  console.log("savePushSubscription: saving for person", person.id);

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

  if (error) { console.log("savePushSubscription error:", error.message); return { error: error.message }; }
  console.log("savePushSubscription: success");
  return { success: true };
}
