"use server";

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
  const supabase = await createClient();
  const { error } = await supabase.from("design_elements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function uploadDesignImage(elementId: string, formData: FormData) {
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
  const supabase = await createClient();
  const { error } = await supabase.from("design_references").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
