"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Place a cue on a script line (its GO point), optionally with a standby line.
// Writes to the same `cues` table the Booth design room uses, so a cue is one
// record across both rooms: the designer defines what it does, the SM defines
// when it is called.
export async function placeCallingCue(data: {
  production_id: string;
  department: "lights" | "sound";
  cue_number: string;
  description?: string | null;
  call_script_line_id: string;
  standby_script_line_id?: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();

  // Next sort_order within the department
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
    call_script_line_id: data.call_script_line_id,
    standby_script_line_id: data.standby_script_line_id || null,
    status: "concept",
    sort_order: (last?.sort_order || 0) + 1,
  });
  if (error) return { error: error.message };

  revalidatePath("/run");
  revalidatePath("/booth");
  return { success: true };
}

export async function updateCallingCue(data: {
  id: string;
  cue_number?: string;
  description?: string | null;
  call_script_line_id?: string | null;
  standby_script_line_id?: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.cue_number !== undefined) patch.cue_number = data.cue_number;
  if (data.description !== undefined) patch.description = data.description || null;
  if (data.call_script_line_id !== undefined) patch.call_script_line_id = data.call_script_line_id;
  if (data.standby_script_line_id !== undefined) patch.standby_script_line_id = data.standby_script_line_id;

  const { error } = await supabase.from("cues").update(patch).eq("id", data.id);
  if (error) return { error: error.message };

  revalidatePath("/run");
  revalidatePath("/booth");
  return { success: true };
}

// Remove a cue from the calling script without deleting the cue itself
// (keeps the designer's record in the Booth; just clears its call placement).
export async function unplaceCallingCue(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase
    .from("cues")
    .update({ call_script_line_id: null, standby_script_line_id: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/run");
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteCallingCue(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("cues").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/run");
  revalidatePath("/booth");
  return { success: true };
}
