"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setSmsOptIn(optIn: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sms_opt_in", { p_opt_in: optIn });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
