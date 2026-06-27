"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { createClient } from "@/lib/supabase/server";
import { canManageFinance, orgIdForProduction, orgIdForRow } from "@/lib/membership";

// Authorize the current user as an OWNER of the org that owns this budget item.
// orgId is derived from the entity/production, never from an arbitrary membership.
async function requireOwner(orgId: string | null, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, error: "Not authenticated" };
  if (!orgId) return { supabase, ok: false as const, error: "Couldn't resolve the organization for this item." };
  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { supabase, ok: false as const, error: "No person record" };
  if (!(await canManageFinance(person.id, orgId))) return { supabase, ok: false as const, error: message };
  return { supabase, ok: true as const, error: null };
}

export async function addBudgetItem(formData: FormData) {
  await assertNotPreviewing();
  const productionId = formData.get("production_id") as string;
  const { supabase, ok, error } = await requireOwner(
    await orgIdForProduction(productionId),
    "Only owners can add budget items"
  );
  if (!ok) return { error };

  const expenseName = formData.get("expense_name") as string;
  const category = formData.get("category") as string;
  const budgetAmount = formData.get("budget_amount") as string;
  const notes = formData.get("notes") as string;
  const vendor = formData.get("vendor") as string;
  const paidBy = formData.get("paid_by") as string;

  const { error: dbErr } = await supabase.from("budget_items").insert({
    production_id: productionId,
    expense_name: expenseName || "New item",
    category: category || "other",
    budget_amount: budgetAmount ? parseFloat(budgetAmount) : null,
    notes: notes || null,
    vendor: vendor || null,
    paid_by: paidBy || null,
  });

  if (dbErr) return { error: dbErr.message };
  return { success: true };
}

export async function updateBudgetItem(formData: FormData) {
  await assertNotPreviewing();
  const id = formData.get("id") as string;
  const { supabase, ok, error } = await requireOwner(
    await orgIdForRow("budget_items", id),
    "Only owners can edit budget items"
  );
  if (!ok) return { error };

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

  const { error: dbErr } = await supabase.from("budget_items").update(updates).eq("id", id);
  if (dbErr) return { error: dbErr.message };
  return { success: true };
}

export async function deleteBudgetItem(id: string) {
  await assertNotPreviewing();
  const { supabase, ok, error } = await requireOwner(
    await orgIdForRow("budget_items", id),
    "Only owners can delete budget items"
  );
  if (!ok) return { error };

  const { error: dbErr } = await supabase.from("budget_items").delete().eq("id", id);
  if (dbErr) return { error: dbErr.message };
  return { success: true };
}
