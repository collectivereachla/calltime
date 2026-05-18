"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getNotifications(limit = 20) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return [];

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at, metadata")
    .eq("person_id", person.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("person_id", person.id)
    .is("read_at", null);

  revalidatePath("/", "layout");
}
