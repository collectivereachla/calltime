"use server";
import { assertNotPreviewing } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveTheme(tokens: {
  colors: Record<string, string>;
  fonts: { display: string; body: string; mono: string };
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_app_theme", { p_tokens: tokens });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const };
}
