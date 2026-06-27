"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { createClient } from "@/lib/supabase/server";
import { getRoleInOrg, isLeadershipRole, resolveActingOrgId, orgIdForProduction, canLeadOrgShows } from "@/lib/membership";

async function person() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, personId: null as string | null };
  const { data: p } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  return { supabase, personId: p?.id ?? null };
}

async function orgIdForItem(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string) {
  const { data } = await supabase.from("inventory_items").select("org_id").eq("id", itemId).maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

async function requireLeader(personId: string | null, orgId: string | null) {
  if (!personId) return { ok: false as const, error: "Not authenticated" };
  if (!orgId) return { ok: false as const, error: "Couldn't resolve the organization." };
  const role = await getRoleInOrg(personId, orgId);
  if (!isLeadershipRole(role) && !(await canLeadOrgShows(personId, orgId))) return { ok: false as const, error: "Only owners and production staff can manage inventory." };
  return { ok: true as const, error: null };
}

export async function addInventoryItem(formData: FormData) {
  await assertNotPreviewing();
  const { supabase, personId } = await person();
  const orgId = personId ? await resolveActingOrgId(personId) : null;
  const gate = await requireLeader(personId, orgId);
  if (!gate.ok) return { error: gate.error };

  const { error } = await supabase.from("inventory_items").insert({
    org_id: orgId,
    name: (formData.get("name") as string)?.trim() || "Untitled item",
    kind: (formData.get("kind") as string) || "other",
    category: (formData.get("category") as string) || null,
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) || 1 : 1,
    condition: (formData.get("condition") as string) || null,
    owner_type: (formData.get("owner_type") as string) || null,
    owner_name: (formData.get("owner_name") as string) || null,
    storage_location: (formData.get("storage_location") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateInventoryItem(formData: FormData) {
  await assertNotPreviewing();
  const { supabase, personId } = await person();
  const id = formData.get("id") as string;
  const orgId = await orgIdForItem(supabase, id);
  const gate = await requireLeader(personId, orgId);
  if (!gate.ok) return { error: gate.error };

  const updates: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k === "id") continue;
    if (k === "quantity" || k === "value_cents") updates[k] = v ? parseInt(v as string) || 0 : null;
    else updates[k] = (v as string) || null;
  }
  updates.updated_at = new Date().toISOString();
  const { error } = await supabase.from("inventory_items").update(updates).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteInventoryItem(id: string) {
  await assertNotPreviewing();
  const { supabase, personId } = await person();
  const orgId = await orgIdForItem(supabase, id);
  const gate = await requireLeader(personId, orgId);
  if (!gate.ok) return { error: gate.error };
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function checkoutItem(formData: FormData) {
  await assertNotPreviewing();
  const { supabase, personId } = await person();
  const itemId = formData.get("item_id") as string;
  const productionId = formData.get("production_id") as string;
  const orgOfProd = productionId ? await orgIdForProduction(productionId) : null;
  const orgOfItem = await orgIdForItem(supabase, itemId);
  if (orgOfProd !== orgOfItem) return { error: "That production belongs to a different organization." };
  const gate = await requireLeader(personId, orgOfProd);
  if (!gate.ok) return { error: gate.error };

  const { error } = await supabase.from("inventory_checkouts").insert({
    item_id: itemId,
    production_id: productionId,
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) || 1 : 1,
    status: "out",
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function returnCheckout(checkoutId: string) {
  await assertNotPreviewing();
  const { supabase, personId } = await person();
  const { data: co } = await supabase.from("inventory_checkouts").select("production_id").eq("id", checkoutId).maybeSingle();
  const orgId = co?.production_id ? await orgIdForProduction(co.production_id) : null;
  const gate = await requireLeader(personId, orgId);
  if (!gate.ok) return { error: gate.error };
  const { error } = await supabase
    .from("inventory_checkouts")
    .update({ status: "returned", returned_at: new Date().toISOString() })
    .eq("id", checkoutId);
  if (error) return { error: error.message };
  return { success: true };
}
