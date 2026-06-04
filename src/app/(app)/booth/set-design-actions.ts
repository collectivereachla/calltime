"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveDesignElement(data: {
  id?: string;
  production_id: string;
  department: string;
  name: string;
  description?: string | null;
  status: string;
  notes?: string | null;
  scene_ids?: string[];
}) {
  await assertNotPreviewing();
  const supabase = await createClient();

  if (data.id) {
    const { error } = await supabase
      .from("design_elements")
      .update({
        name: data.name,
        description: data.description || null,
        status: data.status,
        notes: data.notes || null,
        scene_ids: data.scene_ids || [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("design_elements")
      .insert({
        production_id: data.production_id,
        department: data.department,
        name: data.name,
        description: data.description || null,
        status: data.status,
        notes: data.notes || null,
        scene_ids: data.scene_ids || [],
      });
    if (error) return { error: error.message };
  }

  revalidatePath("/booth");
  return { success: true };
}

export async function deleteDesignElement(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("design_elements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function uploadDesignImage(elementId: string, formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const file = formData.get("image") as File;
  if (!file || file.size === 0) return { error: "No file" };
  if (!file.type.startsWith("image/")) return { error: "Must be an image" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `elements/${elementId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("design-files")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { data: urlData } = supabase.storage.from("design-files").getPublicUrl(path);
  const url = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("design_elements")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("id", elementId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/booth");
  return { success: true, url };
}

export async function saveDesignReference(data: {
  production_id: string;
  department: string;
  title: string;
  description?: string | null;
  category: string;
  formData: FormData;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const file = data.formData.get("image") as File;
  if (!file || file.size === 0) return { error: "No file" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `references/${data.department}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("design-files")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { data: urlData } = supabase.storage.from("design-files").getPublicUrl(path);

  const { error } = await supabase.from("design_references").insert({
    production_id: data.production_id,
    department: data.department,
    title: data.title,
    description: data.description || null,
    image_url: urlData.publicUrl,
    category: data.category,
  });
  if (error) return { error: error.message };

  revalidatePath("/booth");
  return { success: true };
}

export async function deleteDesignReference(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("design_references").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function saveSceneDesignNote(sceneId: string, department: string, content: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase
    .from("scene_design_notes")
    .upsert({ scene_id: sceneId, department, content: content.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "scene_id,department" });
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function toggleMilestone(id: string, completed: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase
    .from("design_milestones")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function seedMilestones(productionId: string, department: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const templates: Record<string, string[]> = {
    set: ["Script analysis & concept discussion", "Research & reference images", "Rough sketches / thumbnails", "Ground plan", "Renderings / color model", "Construction drawings", "Materials & paint list", "Build complete", "Paint complete", "Load-in", "Tech rehearsal ready"],
    sound: ["Script analysis & sound world discussion", "Research & reference sounds", "Sound plot / cue list", "Source music selections", "Sound effects design", "System design & speaker plot", "Programming & levels set", "Paper tech complete", "Tech rehearsal ready"],
    lights: ["Script analysis & concept discussion", "Research & reference images", "Light plot draft", "Color & template selections", "Light plot final", "Channel hookup & dimmer schedule", "Hang & focus", "Cue writing", "Paper tech complete", "Tech rehearsal ready"],
  };
  const items = templates[department] || templates.set;
  for (let i = 0; i < items.length; i++) {
    await supabase.from("design_milestones").upsert({
      production_id: productionId,
      department,
      milestone: items[i],
      sort_order: i + 1,
    }, { onConflict: "production_id,department,milestone" });
  }
  revalidatePath("/booth");
  return { success: true };
}

export async function updateElementPosition(id: string, data: {
  pos_x: number;
  pos_y: number;
  width_ft?: number;
  depth_ft?: number;
  height_ft?: number;
  rotation?: number;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase
    .from("design_elements")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
