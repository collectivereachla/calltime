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

export async function saveMeasurement(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const personId = formData.get("person_id") as string;
  const fittingStatus = (formData.get("fitting_status") as string) || "not_scheduled";
  const height = (formData.get("height") as string) || null;
  const chestBust = (formData.get("chest_bust") as string) || null;
  const waist = (formData.get("waist") as string) || null;
  const hip = (formData.get("hip") as string) || null;
  const inseam = (formData.get("inseam") as string) || null;
  const shoe = (formData.get("shoe") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase
    .from("measurements")
    .upsert({
      production_id: productionId,
      person_id: personId,
      fitting_status: fittingStatus,
      height, chest_bust: chestBust, waist, hip, inseam, shoe, notes,
    }, {
      onConflict: "production_id,person_id",
    });

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}

export async function generateParade(productionId: string) {
  const supabase = await createClient();

  // Get all costume plot entries grouped by person
  const { data: plotEntries } = await supabase
    .from("costume_plot")
    .select("person_id, character_name, scene_id, costume_description")
    .eq("production_id", productionId)
    .order("person_id");

  if (!plotEntries || plotEntries.length === 0) {
    return { error: "No costume plot entries to generate parade from." };
  }

  // Group by person + character for distinct looks
  const looks = new Map<string, { person_id: string; character_name: string; scenes: string[]; descriptions: string[] }>();
  for (const entry of plotEntries) {
    const key = `${entry.person_id}-${entry.character_name}`;
    if (!looks.has(key)) {
      looks.set(key, {
        person_id: entry.person_id,
        character_name: entry.character_name,
        scenes: [],
        descriptions: [],
      });
    }
    const look = looks.get(key)!;
    look.scenes.push(entry.scene_id);
    if (entry.costume_description) look.descriptions.push(entry.costume_description);
  }

  // Delete existing parade entries for this production
  await supabase.from("costume_parade").delete().eq("production_id", productionId);

  // Insert new parade entries
  let order = 1;
  const inserts = [];
  for (const look of looks.values()) {
    const uniqueDescs = [...new Set(look.descriptions)];
    inserts.push({
      production_id: productionId,
      person_id: look.person_id,
      parade_order: order++,
      character_name: look.character_name,
      look_name: uniqueDescs.length === 1 ? uniqueDescs[0] : null,
      pieces_to_present: uniqueDescs.join("; ") || null,
      scenes: look.scenes.length + " scene" + (look.scenes.length !== 1 ? "s" : ""),
      approval_status: "not_reviewed",
      priority: "normal",
    });
  }

  const { error } = await supabase.from("costume_parade").insert(inserts);
  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}

export async function updateParadeStatus(entryId: string, status: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("costume_parade")
    .update({ approval_status: status })
    .eq("id", entryId);

  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}
