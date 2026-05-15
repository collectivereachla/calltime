"use server";

import { createClient } from "@/lib/supabase/server";

async function checkOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, error: "Not authenticated" };
  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();
  if (membership?.role !== "owner") return { supabase, ok: false as const, error: "Only owners can manage revenue" };
  return { supabase, ok: true as const, error: null };
}

export async function addRevenueItem(formData: FormData) {
  const { supabase, ok, error } = await checkOwner();
  if (!ok) return { error };

  const { error: dbErr } = await supabase.from("revenue_items").insert({
    production_id: formData.get("production_id") as string,
    source_name: (formData.get("source_name") as string) || "New item",
    category: (formData.get("category") as string) || "other",
    amount: formData.get("amount") ? parseFloat(formData.get("amount") as string) : null,
    donor_or_event: (formData.get("donor_or_event") as string) || null,
    notes: (formData.get("notes") as string) || null,
    platform: (formData.get("platform") as string) || null,
    received_date: (formData.get("received_date") as string) || null,
  });

  if (dbErr) return { error: dbErr.message };
  return { success: true };
}

export async function updateRevenueItem(formData: FormData) {
  const { supabase, ok, error } = await checkOwner();
  if (!ok) return { error };

  const id = formData.get("id") as string;
  const updates: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (key === "id") continue;
    if (key === "amount") {
      updates[key] = value ? parseFloat(value as string) : null;
    } else if (key === "is_received") {
      updates[key] = value === "true";
      if (value === "true") updates.received_actual_date = new Date().toISOString().split("T")[0];
    } else {
      updates[key] = (value as string) || null;
    }
  }
  updates.updated_at = new Date().toISOString();

  const { error: dbErr } = await supabase.from("revenue_items").update(updates).eq("id", id);
  if (dbErr) return { error: dbErr.message };
  return { success: true };
}

export async function deleteRevenueItem(id: string) {
  const { supabase, ok, error } = await checkOwner();
  if (!ok) return { error };

  const { error: dbErr } = await supabase.from("revenue_items").delete().eq("id", id);
  if (dbErr) return { error: dbErr.message };
  return { success: true };
}
