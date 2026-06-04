"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setCostumeAssignees(
  itemId: string,
  productionId: string,
  personIds: string[]
) {
  await assertNotPreviewing();
  const supabase = await createClient();

  // Replace the full set of actors this item is assigned to for this production.
  const { error: delErr } = await supabase
    .from("costume_assignments")
    .delete()
    .eq("item_id", itemId)
    .eq("production_id", productionId);
  if (delErr) return { error: delErr.message };

  if (personIds.length > 0) {
    const rows = personIds.map((pid) => ({
      item_id: itemId,
      person_id: pid,
      production_id: productionId,
    }));
    const { data, error } = await supabase
      .from("costume_assignments")
      .insert(rows)
      .select("id");

    if (error) return { error: error.message };

    // Zero inserted rows on a non-empty request means RLS silently blocked the
    // write (most often an expired session). Postgres raises no error, so this
    // guard is what surfaces it instead of a false success.
    if (!data || data.length === 0) {
      return {
        error:
          "The change didn't save. You may not have permission, or your session expired — refresh the page and try again.",
      };
    }
  }

  // Keep the legacy availability flag in sync for any older reads.
  await supabase
    .from("costume_inventory")
    .update({ available: personIds.length === 0 })
    .eq("id", itemId);

  revalidatePath("/booth");
  revalidatePath("/dressing-room");
  return { error: null };
}

type OwnerType = "house" | "individual" | "external";

const CATEGORIES = [
  "men", "women", "girls", "boys", "accessories", "shoes", "hats", "other",
];

interface ItemFields {
  itemName: string;
  category: string;
  size: string | null;
  notes: string | null;
  ownerType: OwnerType;
  ownerName: string | null;
  ownerPersonId: string | null;
  storageLocation: string | null;
  thumbnailUrl: string | null;
}

function normalizeOwner(f: ItemFields) {
  return {
    owner_type: f.ownerType,
    owner_name: f.ownerType === "house" ? null : f.ownerName?.trim() || null,
    owner_person_id: f.ownerType === "individual" ? f.ownerPersonId || null : null,
  };
}

export async function createInventoryItem(orgId: string, f: ItemFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.itemName?.trim()) return { error: "Item name is required." };
  if (!CATEGORIES.includes(f.category)) return { error: "Please choose a valid category." };

  const { data, error } = await supabase
    .from("costume_inventory")
    .insert({
      org_id: orgId,
      item_name: f.itemName.trim(),
      category: f.category,
      size: f.size?.trim() || null,
      notes: f.notes?.trim() || null,
      storage_location: f.storageLocation?.trim() || null,
      thumbnail_url: f.thumbnailUrl || null,
      available: true,
      ...normalizeOwner(f),
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't save — you may not have permission to manage this inventory." };
  }
  revalidatePath("/booth");
  return { error: null, id: data[0].id };
}

export async function updateInventoryItem(itemId: string, f: ItemFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.itemName?.trim()) return { error: "Item name is required." };
  if (!CATEGORIES.includes(f.category)) return { error: "Please choose a valid category." };

  const { data, error } = await supabase
    .from("costume_inventory")
    .update({
      item_name: f.itemName.trim(),
      category: f.category,
      size: f.size?.trim() || null,
      notes: f.notes?.trim() || null,
      storage_location: f.storageLocation?.trim() || null,
      thumbnail_url: f.thumbnailUrl || null,
      ...normalizeOwner(f),
    })
    .eq("id", itemId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The change didn't save. You may not have permission, or your session expired — refresh and try again." };
  }
  revalidatePath("/booth");
  return { error: null };
}

export async function deleteInventoryItem(itemId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("costume_inventory")
    .delete()
    .eq("id", itemId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't delete — you may not have permission." };
  }
  revalidatePath("/booth");
  return { error: null };
}
