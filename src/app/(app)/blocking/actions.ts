"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getBlockingData(productionId: string, sceneId?: string) {
  const supabase = await createClient();

  const momentQuery = supabase
    .from("blocking_moments")
    .select("id, scene_id, script_line_id, sort_order, label, notes")
    .eq("production_id", productionId)
    .order("sort_order", { ascending: true });

  if (sceneId) momentQuery.eq("scene_id", sceneId);

  const { data: moments } = await momentQuery;

  if (!moments || moments.length === 0) return { moments: [], positions: {} };

  const momentIds = moments.map((m) => m.id);
  const { data: positions } = await supabase
    .from("blocking_positions")
    .select("id, moment_id, character_name, x, y, on_stage, stage_area, entrance_from, exit_to, annotation_id")
    .in("moment_id", momentIds);

  const posMap: Record<string, NonNullable<typeof positions>> = {};
  for (const p of positions || []) {
    if (!posMap[p.moment_id]) posMap[p.moment_id] = [];
    posMap[p.moment_id]!.push(p);
  }

  return { moments, positions: posMap };
}

export async function saveMoment(params: {
  productionId: string;
  sceneId?: string;
  scriptLineId?: string;
  label: string;
  notes?: string;
  sortOrder: number;
  momentId?: string;
}) {
  const supabase = await createClient();

  if (params.momentId) {
    const { error } = await supabase
      .from("blocking_moments")
      .update({
        label: params.label,
        notes: params.notes || null,
        script_line_id: params.scriptLineId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.momentId);
    if (error) return { error: error.message };
    revalidatePath("/blocking");
    return { success: true, id: params.momentId };
  }

  const { data, error } = await supabase
    .from("blocking_moments")
    .insert({
      production_id: params.productionId,
      scene_id: params.sceneId || null,
      script_line_id: params.scriptLineId || null,
      sort_order: params.sortOrder,
      label: params.label,
      notes: params.notes || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/blocking");
  return { success: true, id: data.id };
}

export async function deleteMoment(momentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blocking_moments")
    .delete()
    .eq("id", momentId);
  if (error) return { error: error.message };
  revalidatePath("/blocking");
  return { success: true };
}

export async function savePositions(
  momentId: string,
  positions: {
    character_name: string;
    x: number;
    y: number;
    on_stage: boolean;
    stage_area?: string;
    entrance_from?: string;
    exit_to?: string;
  }[]
) {
  const supabase = await createClient();

  // Delete existing positions for this moment
  await supabase.from("blocking_positions").delete().eq("moment_id", momentId);

  if (positions.length === 0) return { success: true };

  const rows = positions.map((p) => ({
    moment_id: momentId,
    character_name: p.character_name,
    x: p.x,
    y: p.y,
    on_stage: p.on_stage,
    stage_area: p.stage_area || null,
    entrance_from: p.entrance_from || null,
    exit_to: p.exit_to || null,
  }));

  const { error } = await supabase.from("blocking_positions").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/blocking");
  return { success: true };
}

export async function savePositionAndAnnotation(params: {
  momentId: string;
  characterName: string;
  x: number;
  y: number;
  onStage: boolean;
  stageArea?: string;
  entranceFrom?: string;
  exitTo?: string;
  noteContent: string;
  scriptLineId?: string;
  productionId: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { error: "No person record" };

  // Create the annotation if we have a script line
  let annotationId: string | null = null;
  if (params.scriptLineId && params.noteContent.trim()) {
    const { data: ann, error: annErr } = await supabase
      .from("script_annotations")
      .insert({
        script_line_id: params.scriptLineId,
        person_id: person.id,
        annotation_type: "blocking",
        note_type: "blocking",
        visibility: "production",
        content: params.noteContent,
        tagged_characters: [params.characterName],
      })
      .select("id")
      .single();

    if (annErr) return { error: annErr.message };
    annotationId = ann.id;
  }

  // Upsert the position
  const { error } = await supabase
    .from("blocking_positions")
    .upsert({
      moment_id: params.momentId,
      character_name: params.characterName,
      x: params.x,
      y: params.y,
      on_stage: params.onStage,
      stage_area: params.stageArea || null,
      entrance_from: params.entranceFrom || null,
      exit_to: params.exitTo || null,
      annotation_id: annotationId,
    }, { onConflict: "moment_id,character_name" });

  if (error) return { error: error.message };
  revalidatePath("/blocking");
  revalidatePath("/spine");
  return { success: true, annotationId };
}
