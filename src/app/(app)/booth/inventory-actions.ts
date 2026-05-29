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
