"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProduction(productionId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_production_safe", {
    p_production_id: productionId,
    p_title: formData.get("title") as string,
    p_playwright: (formData.get("playwright") as string) || null,
    p_venue: (formData.get("venue") as string) || null,
    p_first_rehearsal: (formData.get("first_rehearsal") as string) || null,
    p_opening_date: (formData.get("opening_date") as string) || null,
    p_closing_date: (formData.get("closing_date") as string) || null,
    p_description: (formData.get("description") as string) || null,
    p_notes: (formData.get("notes") as string) || null,
    p_program_url: (formData.get("program_url") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  return { success: true };
}

export async function updatePressLinks(productionId: string, links: { title: string; url: string; source?: string }[]) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_production_safe", {
    p_production_id: productionId,
    p_press_links: links,
  });

  if (error) return { error: error.message };
  revalidatePath(`/archive/${productionId}`);
  return { success: true };
}

export async function reopenProduction(productionId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_production_safe", {
    p_production_id: productionId,
    p_status: "pre_production",
  });

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  revalidatePath("/home");
  return { success: true };
}

export async function closeProduction(productionId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_production_safe", {
    p_production_id: productionId,
    p_status: "closed",
  });

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  revalidatePath("/home");
  return { success: true };
}
