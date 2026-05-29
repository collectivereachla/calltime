"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function assignInventoryItem(
  itemId: string,
  personId: string | null,
  productionId: string | null
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("costume_inventory")
    .update({
      assigned_to_person_id: personId,
      assigned_to_production_id: productionId,
      available: personId === null,
    })
    .eq("id", itemId)
    .select("id");

  if (error) return { error: error.message };

  // A request that succeeds but matches zero rows means the write was silently
  // blocked (most likely the session wasn't recognized, so row-level security
  // matched nothing). Postgres raises no error in that case, so without this
  // check the action would report a false success and the UI would revert with
  // no explanation — which is exactly how this bug stayed hidden.
  if (!data || data.length === 0) {
    return {
      error:
        "The change didn't save. Your session may have expired — please refresh the page and try again.",
    };
  }

  revalidatePath("/booth");
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
