"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setFinanceAccess(personId: string, orgId: string, grant: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_finance_access", { p_person_id: personId, p_org_id: orgId, p_grant: grant });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
