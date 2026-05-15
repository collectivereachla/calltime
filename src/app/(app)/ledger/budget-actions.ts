"use server";

import { createClient } from "@/lib/supabase/server";

export async function addBudgetItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can add budget items" };

  const productionId = formData.get("production_id") as string;
  const expenseName = formData.get("expense_name") as string;
  const category = formData.get("category") as string;
  const budgetAmount = formData.get("budget_amount") as string;
  const notes = formData.get("notes") as string;
  const vendor = formData.get("vendor") as string;
  const paidBy = formData.get("paid_by") as string;

  const { error } = await supabase.from("budget_items").insert({
    production_id: productionId,
    expense_name: expenseName || "New item",
    category: category || "other",
    budget_amount: budgetAmount ? parseFloat(budgetAmount) : null,
    notes: notes || null,
    vendor: vendor || null,
    paid_by: paidBy || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateBudgetItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can edit budget items" };

  const id = formData.get("id") as string;
  const updates: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (key === "id") continue;
    if (key === "budget_amount" || key === "actual_cost") {
      updates[key] = value ? parseFloat(value as string) : null;
    } else if (key === "is_paid") {
      updates[key] = value === "true";
      if (value === "true") updates.paid_date = new Date().toISOString().split("T")[0];
    } else {
      updates[key] = (value as string) || null;
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from("budget_items").update(updates).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteBudgetItem(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can delete budget items" };

  const { error } = await supabase.from("budget_items").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}
