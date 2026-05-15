"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitReport(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("sm_reports").insert({
    production_id: formData.get("production_id") as string,
    report_type: formData.get("report_type") as string,
    report_date: formData.get("report_date") as string,
    start_time: (formData.get("start_time") as string) || null,
    end_time: (formData.get("end_time") as string) || null,
    called: (formData.get("called") as string) || null,
    absent_late: (formData.get("absent_late") as string) || null,
    work_completed: (formData.get("work_completed") as string) || null,
    director_notes: (formData.get("director_notes") as string) || null,
    action_items: (formData.get("action_items") as string) || null,
    next_call: (formData.get("next_call") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function updateScene(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("scenes")
    .update({
      title: (formData.get("title") as string) || null,
      description: (formData.get("description") as string) || null,
      location: (formData.get("location") as string) || null,
      characters_tracks: (formData.get("characters_tracks") as string) || null,
      music_sound: (formData.get("music_sound") as string) || null,
      props_practicals: (formData.get("props_practicals") as string) || null,
      sm_watchouts: (formData.get("sm_watchouts") as string) || null,
    })
    .eq("id", formData.get("scene_id") as string);

  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function updateProp(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("props")
    .update({
      prop_name: formData.get("prop_name") as string,
      scenes: (formData.get("scenes") as string) || null,
      used_by: (formData.get("used_by") as string) || null,
      preset_location: (formData.get("preset_location") as string) || null,
      handoff_tracking: (formData.get("handoff_tracking") as string) || null,
      has_backup: formData.get("has_backup") === "on",
      status: formData.get("status") as string,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", formData.get("prop_id") as string);

  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function addProp(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("props").insert({
    production_id: formData.get("production_id") as string,
    prop_name: formData.get("prop_name") as string,
    scenes: (formData.get("scenes") as string) || null,
    used_by: (formData.get("used_by") as string) || null,
    preset_location: (formData.get("preset_location") as string) || null,
    status: "open",
  });

  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
