"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Owner-only; enforced inside the SECURITY DEFINER RPC set_contact_affiliation.
export async function setContactAffiliation(
  contactId: string,
  affiliatedId: string | null,
  role: string | null,
  inKind: string | null
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_contact_affiliation", {
    p_contact_id: contactId,
    p_affiliated_id: affiliatedId || null,
    p_role: role || null,
    p_in_kind: inKind || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/rolodex");
  return { error: null };
}
