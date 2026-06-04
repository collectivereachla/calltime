"use server";
import { assertNotPreviewing } from "@/lib/viewer";

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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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

// Stage area coordinates (normalized 0-1) for position guessing
const AREA_COORDS: Record<string, { x: number; y: number }> = {
  "HL": { x: 0.26, y: 0.77 }, "HR": { x: 0.74, y: 0.77 },
  "HOUSE LEFT": { x: 0.26, y: 0.77 }, "HOUSE RIGHT": { x: 0.74, y: 0.77 },
  "SR": { x: 0.08, y: 0.35 }, "SL": { x: 0.92, y: 0.35 },
  "USR": { x: 0.17, y: 0.25 }, "USC": { x: 0.50, y: 0.22 }, "USL": { x: 0.83, y: 0.25 },
  "CSR": { x: 0.17, y: 0.40 }, "CS": { x: 0.50, y: 0.40 }, "CSL": { x: 0.83, y: 0.40 },
  "DSR": { x: 0.17, y: 0.55 }, "DSC": { x: 0.50, y: 0.55 }, "DSL": { x: 0.83, y: 0.55 },
  "CENTER STAGE": { x: 0.50, y: 0.40 }, "CENTER STAGE LEFT": { x: 0.83, y: 0.40 },
  "CENTER STAGE RIGHT": { x: 0.17, y: 0.40 }, "DOWNSTAGE": { x: 0.50, y: 0.55 },
  "porch": { x: 0.50, y: 0.21 }, "PORCH": { x: 0.50, y: 0.21 },
  "house": { x: 0.50, y: 0.12 },
};

function guessPosition(text: string): { x: number; y: number } | null {
  const upper = text.toUpperCase();
  // Check specific areas first (longer matches)
  const ordered = Object.entries(AREA_COORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, coords] of ordered) {
    if (upper.includes(key.toUpperCase())) return coords;
  }
  return null;
}

export async function seedBlockingFromNotes(productionId: string, sceneId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();

  // Get the scene info
  const { data: scene } = await supabase
    .from("scenes").select("act, scene_number, title").eq("id", sceneId).single();
  if (!scene) return { error: "Scene not found" };

  // Get the script for this production
  const { data: script } = await supabase
    .from("scripts").select("id").eq("production_id", productionId).single();
  if (!script) return { error: "No script found" };

  // Get all lines for this scene
  const { data: lines } = await supabase
    .from("script_lines")
    .select("id, line_number, line_type, character, content, tagged_characters")
    .eq("script_id", script.id)
    .eq("act", scene.act)
    .eq("scene", scene.scene_number)
    .order("line_number", { ascending: true });

  if (!lines || lines.length === 0) return { error: "No script lines for this scene" };

  // Get all blocking annotations for these lines
  const lineIds = lines.map((l) => l.id);
  const { data: annotations } = await supabase
    .from("script_annotations")
    .select("id, script_line_id, content, tagged_characters, note_type")
    .in("script_line_id", lineIds)
    .eq("note_type", "blocking")
    .order("created_at", { ascending: true });

  // Also get stage directions with tagged characters
  const taggedDirections = lines.filter(
    (l) => l.line_type === "stage_direction" && l.tagged_characters && (l.tagged_characters as string[]).length > 0
  );

  // Build moments from annotations and tagged stage directions
  type MomentSeed = {
    lineId: string;
    lineNumber: number;
    label: string;
    characters: { name: string; x: number; y: number }[];
  };

  const momentSeeds: MomentSeed[] = [];

  // Stage directions with tags become moments
  for (const sd of taggedDirections) {
    const chars = (sd.tagged_characters as string[]).map((name) => {
      const pos = guessPosition(sd.content) || { x: 0.50, y: 0.40 };
      return { name, ...pos };
    });
    momentSeeds.push({
      lineId: sd.id,
      lineNumber: sd.line_number,
      label: sd.content.length > 50 ? sd.content.slice(0, 47) + "..." : sd.content,
      characters: chars,
    });
  }

  // Blocking annotations become moments
  for (const ann of annotations || []) {
    const chars = ((ann.tagged_characters as string[]) || []).map((name) => {
      const pos = guessPosition(ann.content) || { x: 0.50, y: 0.40 };
      return { name, ...pos };
    });
    const line = lines.find((l) => l.id === ann.script_line_id);
    momentSeeds.push({
      lineId: ann.script_line_id,
      lineNumber: line?.line_number || 0,
      label: ann.content.length > 50 ? ann.content.slice(0, 47) + "..." : ann.content,
      characters: chars,
    });
  }

  // Sort by line number
  momentSeeds.sort((a, b) => a.lineNumber - b.lineNumber);

  // Delete existing moments for this scene (fresh import)
  await supabase.from("blocking_moments").delete()
    .eq("production_id", productionId).eq("scene_id", sceneId);

  // Insert moments and positions
  let created = 0;
  for (let i = 0; i < momentSeeds.length; i++) {
    const seed = momentSeeds[i];
    const { data: moment, error: mErr } = await supabase
      .from("blocking_moments")
      .insert({
        production_id: productionId,
        scene_id: sceneId,
        script_line_id: seed.lineId,
        sort_order: i,
        label: seed.label,
      })
      .select("id")
      .single();

    if (mErr || !moment) continue;

    if (seed.characters.length > 0) {
      await supabase.from("blocking_positions").insert(
        seed.characters.map((c) => ({
          moment_id: moment.id,
          character_name: c.name,
          x: c.x,
          y: c.y,
          on_stage: true,
          stage_area: null,
        }))
      );
    }
    created++;
  }

  revalidatePath("/blocking");
  return { success: true, count: created };
}
