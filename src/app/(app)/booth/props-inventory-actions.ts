"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setPropAssignees(
  itemId: string,
  productionId: string,
  personIds: string[]
) {
  const supabase = await createClient();

  // Replace the full set of actors this prop is assigned to for this production.
  const { error: delErr } = await supabase
    .from("prop_assignments")
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
      .from("prop_assignments")
      .insert(rows)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return {
        error:
          "The change didn't save. You may not have permission, or your session expired — refresh the page and try again.",
      };
    }
  }

  revalidatePath("/booth");
  revalidatePath("/dressing-room");
  return { error: null };
}

type OwnerType = "house" | "individual" | "external";

const CATEGORIES = ["hand", "set_dressing", "furniture", "consumable", "weapon", "paper", "other"];

interface PropFields {
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

function normalizeOwner(f: PropFields) {
  return {
    owner_type: f.ownerType,
    owner_name: f.ownerType === "house" ? null : f.ownerName?.trim() || null,
    owner_person_id: f.ownerType === "individual" ? f.ownerPersonId || null : null,
  };
}

export async function createPropItem(orgId: string, f: PropFields) {
  const supabase = await createClient();
  if (!f.itemName?.trim()) return { error: "Item name is required." };
  if (!CATEGORIES.includes(f.category)) return { error: "Please choose a valid category." };

  const { data, error } = await supabase
    .from("props_inventory")
    .insert({
      org_id: orgId,
      item_name: f.itemName.trim(),
      category: f.category,
      size: f.size?.trim() || null,
      notes: f.notes?.trim() || null,
      storage_location: f.storageLocation?.trim() || null,
      thumbnail_url: f.thumbnailUrl || null,
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

export async function updatePropItem(itemId: string, f: PropFields) {
  const supabase = await createClient();
  if (!f.itemName?.trim()) return { error: "Item name is required." };
  if (!CATEGORIES.includes(f.category)) return { error: "Please choose a valid category." };

  const { data, error } = await supabase
    .from("props_inventory")
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

export async function deletePropItem(itemId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("props_inventory")
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
