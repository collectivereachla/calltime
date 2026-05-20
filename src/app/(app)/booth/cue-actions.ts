"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveCue(data: {
  id?: string;
  production_id: string;
  department: string;
  cue_number: string;
  description?: string | null;
  page_ref?: string | null;
  scene_id?: string | null;
  trigger_line?: string | null;
  duration?: string | null;
  notes?: string | null;
  status?: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  if (data.id) {
    const { error } = await supabase
      .from("cues")
      .update({
        cue_number: data.cue_number,
        description: data.description || null,
        page_ref: data.page_ref || null,
        scene_id: data.scene_id || null,
        trigger_line: data.trigger_line || null,
        duration: data.duration || null,
        notes: data.notes || null,
        status: data.status || "concept",
        metadata: data.metadata || {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    // Get next sort_order
    const { data: last } = await supabase
      .from("cues")
      .select("sort_order")
      .eq("production_id", data.production_id)
      .eq("department", data.department)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("cues").insert({
      production_id: data.production_id,
      department: data.department,
      cue_number: data.cue_number,
      description: data.description || null,
      page_ref: data.page_ref || null,
      scene_id: data.scene_id || null,
      trigger_line: data.trigger_line || null,
      duration: data.duration || null,
      notes: data.notes || null,
      status: data.status || "concept",
      sort_order: (last?.sort_order || 0) + 1,
      metadata: data.metadata || {},
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/booth");
  return { success: true };
}

export async function deleteCue(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cues").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function updateCueStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cues")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
