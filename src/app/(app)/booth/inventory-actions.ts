"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function assignInventoryItem(
  itemId: string,
  personId: string | null,
  productionId: string | null
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("costume_inventory")
    .update({
      assigned_to_person_id: personId,
      assigned_to_production_id: productionId,
      available: personId === null,
    })
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}
