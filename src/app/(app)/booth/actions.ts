"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function upsertCostumePlot(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const sceneId = formData.get("scene_id") as string;
  const personId = formData.get("person_id") as string;
  const characterName = formData.get("character_name") as string;
  const costumeDescription = (formData.get("costume_description") as string) || null;
  const changeNotes = (formData.get("change_notes") as string) || null;
  const changeLocation = (formData.get("change_location") as string) || null;
  const status = (formData.get("status") as string) || "planned";

  const { error } = await supabase
    .from("costume_plot")
    .upsert({
      production_id: productionId,
      scene_id: sceneId,
      person_id: personId,
      character_name: characterName,
      costume_description: costumeDescription,
      change_notes: changeNotes,
      change_location: changeLocation,
      status,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "scene_id,person_id,character_name",
    });

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}

export async function addScene(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const act = parseInt(formData.get("act") as string);
  const sceneNumber = parseInt(formData.get("scene_number") as string);
  const title = (formData.get("title") as string) || null;

  const { error } = await supabase.from("scenes").insert({
    production_id: productionId,
    act,
    scene_number: sceneNumber,
    title,
    sort_order: act * 100 + sceneNumber,
  });

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}

export async function updateScene(formData: FormData) {
  const supabase = await createClient();

  const sceneId = formData.get("scene_id") as string;
  const title = (formData.get("title") as string) || null;
  const description = (formData.get("description") as string) || null;

  const { error } = await supabase
    .from("scenes")
    .update({ title, description })
    .eq("id", sceneId);

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}
