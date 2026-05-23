"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProduction(productionId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("productions")
    .update({
      title: formData.get("title") as string,
      playwright: (formData.get("playwright") as string) || null,
      venue: (formData.get("venue") as string) || null,
      first_rehearsal: (formData.get("first_rehearsal") as string) || null,
      opening_date: (formData.get("opening_date") as string) || null,
      closing_date: (formData.get("closing_date") as string) || null,
      description: (formData.get("description") as string) || null,
      notes: (formData.get("notes") as string) || null,
      program_url: (formData.get("program_url") as string) || null,
    })
    .eq("id", productionId);

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  return { success: true };
}

export async function updatePressLinks(productionId: string, links: { title: string; url: string; source?: string }[]) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("productions")
    .update({ press_links: links })
    .eq("id", productionId);

  if (error) return { error: error.message };
  revalidatePath(`/archive/${productionId}`);
  return { success: true };
}

export async function reopenProduction(productionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("productions")
    .update({ status: "pre_production" })
    .eq("id", productionId);

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  revalidatePath("/home");
  return { success: true };
}

export async function closeProduction(productionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("productions")
    .update({ status: "closed" })
    .eq("id", productionId);

  if (error) return { error: error.message };
  revalidatePath("/archive");
  revalidatePath(`/archive/${productionId}`);
  revalidatePath("/home");
  return { success: true };
}
