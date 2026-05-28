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

// Resolve a script character name (e.g. "ISAAC" or "ISAAC / NARRATOR") to the
// person playing it, via production_assignments.role_title. Mirrors the matcher
// used in Line Lab so dual-role casting resolves correctly.
function characterMatchesRole(character: string, roleTitle: string): boolean {
  const charParts = character.toUpperCase().split(" / ").map((s) => s.trim());
  const roleParts = roleTitle.toUpperCase().split(" / ").map((s) => s.trim());
  return charParts.some((c) => roleParts.some((r) => r === c));
}

// Fast capture: one tap on a script line + a note type. The actor is derived
// from the line's character — no dropdown. marked_text is the optional
// dropped/added span the SM highlighted on the line itself.
export async function addFastLineNote(input: {
  productionId: string;
  scriptLineId: string;
  noteType: string;
  markedText?: string | null;
  eventId?: string | null;
  category?: "line" | "blocking";
  personId?: string | null;   // explicit actor (e.g. blocking on a stage direction)
  content?: string | null;    // explicit content (e.g. a tapped blocking note)
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user.id).single();
  if (!person) return { error: "No person record" };

  // The line being marked — gives us character, act/scene, and content for refs.
  const { data: line } = await supabase
    .from("script_lines")
    .select("id, line_number, act, scene, character, content")
    .eq("id", input.scriptLineId)
    .single();
  if (!line) return { error: "Script line not found" };

  // Resolve the actor. If one was passed explicitly (blocking notes tapped on a
  // stage direction name the actor directly), use it; otherwise derive from the
  // line's character.
  let targetPersonId = input.personId || null;
  if (!targetPersonId) {
    if (!line.character) return { error: "That line has no character to assign a note to" };
    const { data: cast } = await supabase
      .from("production_assignments")
      .select("person_id, role_title")
      .eq("production_id", input.productionId)
      .eq("department", "cast")
      .eq("active", true);
    const match = (cast || []).find((c) => characterMatchesRole(line.character!, c.role_title));
    if (!match) {
      return { error: `No active cast member is assigned to ${line.character}. Add the casting in Company first.` };
    }
    targetPersonId = match.person_id;
  }

  const sceneRef = line.act != null && line.scene != null
    ? `Act ${line.act}, Sc ${line.scene}` : null;
  const lineRef = `L${line.line_number}`;
  const category = input.category === "blocking" ? "blocking" : "line";

  // For a blocking note, the useful content is the *intended* blocking for this
  // moment, so the actor sees what the move should be. A tapped blocking note
  // passes its content directly; otherwise fall back to the line's planned
  // blocking annotation, then the line text. Line notes use the line as written.
  let content: string;
  if (category === "blocking") {
    if (input.content?.trim()) {
      content = input.content.trim();
    } else {
      const { data: blockingAnno } = await supabase
        .from("script_annotations")
        .select("content")
        .eq("script_line_id", line.id)
        .eq("note_type", "blocking")
        .limit(1)
        .maybeSingle();
      content = blockingAnno?.content?.trim() || line.content;
    }
  } else {
    content = input.markedText?.trim() ? input.markedText.trim() : line.content;
  }

  const { error } = await supabase.from("line_notes").insert({
    production_id: input.productionId,
    event_id: input.eventId || null,
    person_id: targetPersonId,
    script_line_id: line.id,
    scene_ref: sceneRef,
    line_ref: lineRef,
    category,
    note_type: input.noteType || (category === "blocking" ? "position" : "missed"),
    content,
    marked_text: category === "line" ? (input.markedText?.trim() || null) : null,
    created_by: person.id,
  });
  if (error) return { error: error.message };

  const { data: prod } = await supabase
    .from("productions").select("org_id").eq("id", input.productionId).single();
  const { data: actor } = await supabase
    .from("people").select("preferred_name, full_name").eq("id", targetPersonId).single();
  if (prod && actor) {
    const actorName = actor.preferred_name || actor.full_name.split(" ")[0];
    const authorName = person.preferred_name || person.full_name.split(" ")[0];
    logActivity({
      productionId: input.productionId,
      orgId: prod.org_id,
      actorPersonId: person.id,
      action: "line_note_added",
      entityType: "line_note",
      summary: `${authorName} gave ${actorName} a ${category} note`,
    }).catch(() => {});
  }

  revalidatePath("/run");
  return { success: true, actorPersonId: targetPersonId };
}

// Actor acknowledges a note ("Got it") — distinct from the SM marking it delivered.
export async function markLineNoteCorrected(noteId: string, corrected: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("line_notes")
    .update({ corrected_at: corrected ? new Date().toISOString() : null })
    .eq("id", noteId);
  if (error) return { error: error.message };
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
