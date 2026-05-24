"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}) {
  console.log("savePushSubscription called");
  
  // Get the user's person_id via the regular client (authenticated)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.log("savePushSubscription: no user"); return { error: "Not authenticated" }; }

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!person) { console.log("savePushSubscription: no person"); return { error: "No person record" }; }

  console.log("savePushSubscription: saving for", person.id);

  // Use admin client to bypass RLS
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
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
