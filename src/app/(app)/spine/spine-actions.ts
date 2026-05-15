"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addAnnotation(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return { error: "No person record" };

  const scriptLineId = formData.get("script_line_id") as string;
  const content = formData.get("content") as string;
  const annotationType = (formData.get("annotation_type") as string) || "blocking";
  const targetCharacter = (formData.get("target_character") as string) || null;

  if (!scriptLineId || !content?.trim()) {
    return { error: "Line and note content required" };
  }

  const { error } = await supabase.from("script_annotations").insert({
    script_line_id: scriptLineId,
    person_id: person.id,
    annotation_type: annotationType,
    content: content.trim(),
    target_character: targetCharacter,
  });

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function deleteAnnotation(annotationId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("script_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function updateAnnotation(formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id") as string;
  const content = formData.get("content") as string;

  if (!id || !content?.trim()) {
    return { error: "ID and content required" };
  }

  const { error } = await supabase
    .from("script_annotations")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}
