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
  const noteType = (formData.get("note_type") as string) || "blocking";
  const visibility = (formData.get("visibility") as string) || "production";
  const taggedRaw = formData.get("tagged_characters") as string;
  const taggedCharacters = taggedRaw
    ? taggedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const isPinned = formData.get("is_pinned") === "true";

  if (!scriptLineId || !content?.trim()) {
    return { error: "Line and note content required" };
  }

  const { error } = await supabase.from("script_annotations").insert({
    script_line_id: scriptLineId,
    person_id: person.id,
    annotation_type: noteType,
    note_type: noteType,
    content: content.trim(),
    visibility,
    tagged_characters: taggedCharacters,
    is_pinned: isPinned,
  });

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

  const updates: Record<string, unknown> = {
    content: content.trim(),
    updated_at: new Date().toISOString(),
  };

  const taggedRaw = formData.get("tagged_characters") as string | null;
  if (taggedRaw !== null) {
    updates.tagged_characters = taggedRaw
      .split(",").map((s) => s.trim()).filter(Boolean);
  }

  const noteType = formData.get("note_type") as string | null;
  if (noteType) {
    updates.note_type = noteType;
    updates.annotation_type = noteType;
  }

  const isPinned = formData.get("is_pinned");
  if (isPinned !== null) updates.is_pinned = isPinned === "true";

  const { error } = await supabase
    .from("script_annotations")
    .update(updates)
    .eq("id", id);

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

export async function searchScript(
  scriptId: string,
  query: string
) {
  const supabase = await createClient();
  const q = "%" + query + "%";

  const { data: lines } = await supabase
    .from("script_lines")
    .select("id, line_number, act, scene, content")
    .eq("script_id", scriptId)
    .ilike("content", q)
    .order("line_number")
    .limit(30);

  const { data: allLines } = await supabase
    .from("script_lines")
    .select("id, line_number, act, scene")
    .eq("script_id", scriptId);

  const lineMap = new Map((allLines || []).map((l: any) => [l.id, l]));

  const { data: matchedAnnotations } = await supabase
    .from("script_annotations")
    .select("id, script_line_id, content")
    .ilike("content", q)
    .limit(30);

  const annotations = (matchedAnnotations || [])
    .filter((a: any) => lineMap.has(a.script_line_id))
    .map((a: any) => {
      const line = lineMap.get(a.script_line_id)!;
      return { ...a, line_number: (line as any).line_number, act: (line as any).act, scene: (line as any).scene };
    });

  return { lines: lines || [], annotations };
}
