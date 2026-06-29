"use server";

import { createClient } from "@/lib/supabase/server";

// Persist per-person UI preferences (nav width, room order) to the account.
export async function saveUiPrefs(prefs: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.rpc("set_ui_prefs", { p_prefs: prefs });
}
