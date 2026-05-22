"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function addAnnotation(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name")
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

  // Notify actors whose characters are tagged
  if (taggedCharacters.length > 0 && visibility === "production") {
    notifyTaggedActors(
      scriptLineId,
      taggedCharacters,
      content.trim(),
      noteType,
      person,
    ).catch(() => {});
  }

  // Activity log
  if (visibility === "production") {
    const supabase2 = await createClient();
    const { data: line } = await supabase2
      .from("script_lines")
      .select("act, scene, scripts!inner(production_id, productions!inner(org_id))")
      .eq("id", scriptLineId)
      .single();

    if (line) {
      const s = line.scripts as unknown as { production_id: string; productions: { org_id: string } };
      const authorName = person.preferred_name || person.full_name.split(" ")[0];
      const label = noteType === "blocking" ? "blocking note" : noteType === "tech_cue" ? "tech cue" : "note";
      const scene = line.act && line.scene ? ` (Act ${line.act}, Sc ${line.scene})` : "";
      const tagged = taggedCharacters.length > 0 ? ` for ${taggedCharacters.join(", ")}` : "";

      logActivity({
        productionId: s.production_id,
        orgId: s.productions.org_id,
        actorPersonId: person.id,
        action: "annotation_added",
        entityType: "script_annotation",
        summary: `${authorName} added a ${label}${tagged}${scene}`,
      }).catch(() => {});
    }
  }

  revalidatePath("/spine");
  return { success: true };
}

async function notifyTaggedActors(
  scriptLineId: string,
  taggedCharacters: string[],
  content: string,
  noteType: string,
  author: { id: string; full_name: string; preferred_name: string | null },
) {
  const supabase = await createClient();

  // Get the production from the script line
  const { data: line } = await supabase
    .from("script_lines")
    .select("script_id, act, scene, scripts!inner(production_id, productions!inner(org_id))")
    .eq("id", scriptLineId)
    .single();

  if (!line) return;

  const script = line.scripts as unknown as {
    production_id: string;
    productions: { org_id: string };
  };
  const orgId = script.productions.org_id;
  const productionId = script.production_id;

  // Find actors assigned to these character names (case-insensitive match on role_title)
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("person_id, role_title")
    .eq("production_id", productionId)
    .eq("department", "cast")
    .eq("active", true);

  if (!assignments) return;

  const authorName = author.preferred_name || author.full_name.split(" ")[0];
  const label = noteType === "blocking" ? "Blocking note" : noteType === "tech_cue" ? "Tech cue" : "Note";
  const sceneLabel = line.act && line.scene ? `Act ${line.act}, Scene ${line.scene}` : "";
  const preview = content.length > 60 ? content.slice(0, 57) + "…" : content;

  const notified = new Set<string>();

  for (const assignment of assignments) {
    if (notified.has(assignment.person_id)) continue;
    if (assignment.person_id === author.id) continue;

    // Check if this actor's character is tagged
    const actorCharacter = assignment.role_title.toLowerCase();
    const isTagged = taggedCharacters.some(
      (tc) => tc.toLowerCase() === actorCharacter
    );

    if (isTagged) {
      notified.add(assignment.person_id);
      createNotification({
        personId: assignment.person_id,
        orgId,
        type: "annotation_tagged",
        title: `${label} for ${assignment.role_title}`,
        body: `${authorName}${sceneLabel ? ` — ${sceneLabel}` : ""}: ${preview}`,
        link: "/spine",
      }).catch(() => {});
    }
  }
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

export async function createScriptVersion(
  sourceScriptId: string,
  versionLabel: string,
  versionNotes: string | null,
  copyAnnotations: boolean
) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_script_version", {
    p_source_script_id: sourceScriptId,
    p_version_label: versionLabel,
    p_version_notes: versionNotes,
    p_copy_annotations: copyAnnotations,
  });

  if (error) return { error: error.message };

  revalidatePath("/spine");
  return { success: true, newScriptId: data };
}

export async function lockScriptVersion(scriptId: string, locked: boolean) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("lock_script_version", {
    p_script_id: scriptId,
    p_locked: locked,
  });

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function updateVersionNotes(scriptId: string, notes: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_script_version_notes", {
    p_script_id: scriptId,
    p_version_notes: notes,
  });

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function updateScriptLine(
  lineId: string,
  updates: { content?: string; character?: string | null; line_type?: string }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("script_lines")
    .update(updates)
    .eq("id", lineId);

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function deleteScriptLine(lineId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("script_lines")
    .delete()
    .eq("id", lineId);

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}
