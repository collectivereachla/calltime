"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

// ── Run Sheet ──

export async function addRunSheetItem(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const category = formData.get("category") as string;
  const label = formData.get("label") as string;

  // Get max sort_order for this category
  const { data: existing } = await supabase
    .from("run_sheet_items")
    .select("sort_order")
    .eq("production_id", productionId)
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("run_sheet_items").insert({
    production_id: productionId,
    category,
    sort_order: nextOrder,
    label,
    assigned_to: (formData.get("assigned_to") as string) || null,
    time_estimate: (formData.get("time_estimate") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

export async function toggleRunSheetItem(itemId: string, completed: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("run_sheet_items")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

export async function deleteRunSheetItem(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("run_sheet_items").delete().eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

export async function resetRunSheet(productionId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("run_sheet_items")
    .update({ completed: false, completed_at: null })
    .eq("production_id", productionId);
  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

// ── Line Notes ──

export async function addLineNote(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user.id).single();
  if (!person) return { error: "No person record" };

  const productionId = formData.get("production_id") as string;
  const personId = formData.get("person_id") as string;

  const { error } = await supabase.from("line_notes").insert({
    production_id: productionId,
    event_id: (formData.get("event_id") as string) || null,
    person_id: personId,
    scene_ref: (formData.get("scene_ref") as string) || null,
    line_ref: (formData.get("line_ref") as string) || null,
    note_type: (formData.get("note_type") as string) || "missed",
    content: formData.get("content") as string,
    created_by: person.id,
  });

  if (error) return { error: error.message };

  // Activity log
  const { data: prod } = await supabase
    .from("productions").select("org_id").eq("id", productionId).single();
  const { data: actor } = await supabase
    .from("people").select("preferred_name, full_name").eq("id", personId).single();

  if (prod && actor) {
    const actorName = actor.preferred_name || actor.full_name.split(" ")[0];
    const authorName = person.preferred_name || person.full_name.split(" ")[0];
    logActivity({
      productionId,
      orgId: prod.org_id,
      actorPersonId: person.id,
      action: "line_note_added",
      entityType: "line_note",
      summary: `${authorName} gave ${actorName} a line note`,
    }).catch(() => {});
  }

  revalidatePath("/run");
  return { success: true };
}

export async function markLineNoteGiven(noteId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("line_notes")
    .update({ given_to_actor: true })
    .eq("id", noteId);
  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

// ── Rehearsal Work Log ──

export async function logRehearsalWork(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("rehearsal_work").insert({
    production_id: formData.get("production_id") as string,
    event_id: (formData.get("event_id") as string) || null,
    scene_id: (formData.get("scene_id") as string) || null,
    work_type: (formData.get("work_type") as string) || "scene_work",
    run_count: parseInt(formData.get("run_count") as string) || 1,
    notes: (formData.get("notes") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}

// ── Show Report (uses existing sm_reports table) ──

export async function submitShowReport(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user.id).single();
  if (!person) return { error: "No person record" };

  const productionId = formData.get("production_id") as string;

  const { error } = await supabase.from("sm_reports").insert({
    production_id: productionId,
    event_id: (formData.get("event_id") as string) || null,
    report_type: (formData.get("report_type") as string) || "rehearsal",
    report_date: formData.get("report_date") as string,
    start_time: (formData.get("start_time") as string) || null,
    end_time: (formData.get("end_time") as string) || null,
    called: (formData.get("called") as string) || null,
    absent_late: (formData.get("absent_late") as string) || null,
    work_completed: (formData.get("work_completed") as string) || null,
    director_notes: (formData.get("director_notes") as string) || null,
    action_items: (formData.get("action_items") as string) || null,
    next_call: (formData.get("next_call") as string) || null,
    completed_by: person.id,
  });

  if (error) return { error: error.message };

  // Activity log
  const { data: prod } = await supabase
    .from("productions").select("org_id").eq("id", productionId).single();
  if (prod) {
    const name = person.preferred_name || person.full_name.split(" ")[0];
    const type = formData.get("report_type") === "performance" ? "show" : "rehearsal";
    logActivity({
      productionId,
      orgId: prod.org_id,
      actorPersonId: person.id,
      action: "report_filed",
      entityType: "sm_report",
      summary: `${name} filed a ${type} report for ${formData.get("report_date")}`,
    }).catch(() => {});
  }

  revalidatePath("/run");
  return { success: true };
}
