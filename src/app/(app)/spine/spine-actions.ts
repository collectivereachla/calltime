"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function addAnnotation(formData: FormData) {
  await assertNotPreviewing();
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

  // Optional cue anchor: which word/phrase in the line this blocking note fires on.
  const cueStartRaw = formData.get("cue_start") as string | null;
  const cueEndRaw = formData.get("cue_end") as string | null;
  const cueText = (formData.get("cue_text") as string | null) || null;
  const cueStart = cueStartRaw !== null && cueStartRaw !== "" ? parseInt(cueStartRaw, 10) : null;
  const cueEnd = cueEndRaw !== null && cueEndRaw !== "" ? parseInt(cueEndRaw, 10) : null;

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
    cue_start: Number.isFinite(cueStart as number) ? cueStart : null,
    cue_end: Number.isFinite(cueEnd as number) ? cueEnd : null,
    cue_text: cueText,
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

    // A doubled-cast actor's role_title can list several characters
    // ("Rev. Marshall / Ashmay"); match the tag against each part.
    const roleParts = assignment.role_title
      .split(" / ")
      .map((p: string) => p.trim().toLowerCase());
    const isTagged = taggedCharacters.some((tc) =>
      roleParts.includes(tc.trim().toLowerCase())
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
  await assertNotPreviewing();
  const supabase = await createClient();

  const id = formData.get("id") as string;
  const content = formData.get("content") as string;

  if (!id || !content?.trim()) {
    return { error: "ID and content required" };
  }

  const taggedRaw = formData.get("tagged_characters") as string | null;
  const taggedChars = taggedRaw
    ? taggedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const noteType = formData.get("note_type") as string | null;
  const isPinnedRaw = formData.get("is_pinned");
  const isPinned = isPinnedRaw !== null ? isPinnedRaw === "true" : null;

  const { error } = await supabase.rpc("update_script_annotation", {
    p_annotation_id: id,
    p_content: content.trim(),
    p_tagged_characters: taggedChars,
    p_note_type: noteType || null,
    p_is_pinned: isPinned,
  });

  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function deleteAnnotation(annotationId: string) {
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  updates: {
    content?: string;
    character?: string | null;
    line_type?: string;
    tagged_characters?: string[];
  }
) {
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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

// ─── Mentions ────────────────────────────────────────────────────────────────
// A "mention" is a reference to a character in spoken or sung text — by nickname
// or full name (JJ → JEREMY, Annie Will → MAMA). The pass is REVIEWED: it surfaces
// candidate hits (flagging ambiguous ones where an alias maps to more than one
// character, e.g. "Mama") and only writes tags the manager approves. Tags are
// written only to dialogue/lyric lines, which never render character chips, so
// the tagging stays quiet and powers the "mentioned in" filter without cluttering
// the script.

export interface MentionCandidate {
  key: string;
  lineId: string;
  lineNumber: number;
  act: number | null;
  scene: number | null;
  lineType: string;
  character: string | null;
  content: string;
  alias: string;
  tokens: string[];
  ambiguous: boolean;
}

export async function scanMentions(scriptId: string): Promise<{
  error?: string;
  candidates?: MentionCandidate[];
  aliasCount?: number;
}> {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: scriptRow } = await supabase
    .from("scripts")
    .select("production_id")
    .eq("id", scriptId)
    .single();
  if (!scriptRow) return { error: "Script not found" };
  const productionId = (scriptRow as { production_id: string }).production_id;

  const { data: aliasRows } = await supabase
    .from("mention_aliases")
    .select("character_token, alias")
    .eq("production_id", productionId);

  if (!aliasRows || aliasRows.length === 0) {
    return { candidates: [], aliasCount: 0 };
  }

  // alias(lowercased) → { display, canonical tokens }
  const aliasToTokens = new Map<string, { display: string; tokens: string[] }>();
  for (const r of aliasRows) {
    const aliasStr = r.alias as string;
    const key = aliasStr.toLowerCase();
    if (!aliasToTokens.has(key)) aliasToTokens.set(key, { display: aliasStr, tokens: [] });
    const entry = aliasToTokens.get(key)!;
    const tok = (r.character_token as string).toUpperCase();
    if (!entry.tokens.includes(tok)) entry.tokens.push(tok);
  }

  // Only spoken/sung text — keeps the tags quiet (no chips on these line types).
  const { data: lines } = await supabase
    .from("script_lines")
    .select("id, line_number, act, scene, line_type, character, content, tagged_characters")
    .eq("script_id", scriptId)
    .in("line_type", ["dialogue", "lyric"])
    .order("line_number", { ascending: true });

  const candidates: MentionCandidate[] = [];
  for (const line of lines || []) {
    const content = line.content as string;
    const existing = ((line.tagged_characters as string[] | null) || []).map((t) => t.toUpperCase());
    for (const [aliasLower, entry] of aliasToTokens) {
      const esc = aliasLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${esc}\\b`, "i");
      if (!re.test(content)) continue;
      const proposed = entry.tokens.filter((t) => !existing.includes(t));
      if (proposed.length === 0) continue; // already tagged
      candidates.push({
        key: `${line.id}::${aliasLower}`,
        lineId: line.id as string,
        lineNumber: line.line_number as number,
        act: line.act as number | null,
        scene: line.scene as number | null,
        lineType: line.line_type as string,
        character: line.character as string | null,
        content,
        alias: entry.display,
        tokens: proposed,
        ambiguous: entry.tokens.length > 1,
      });
    }
  }

  return { candidates, aliasCount: aliasRows.length };
}

export async function applyMentionTags(
  updates: { lineId: string; tokens: string[] }[]
): Promise<{ error?: string; success?: boolean; updated?: number }> {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Merge approvals per line (a line can pick up several approved aliases).
  const byLine = new Map<string, Set<string>>();
  for (const u of updates) {
    if (!byLine.has(u.lineId)) byLine.set(u.lineId, new Set());
    for (const t of u.tokens) byLine.get(u.lineId)!.add(t.toUpperCase());
  }

  let updated = 0;
  for (const [lineId, tokenSet] of byLine) {
    if (tokenSet.size === 0) continue;
    const { data: line } = await supabase
      .from("script_lines")
      .select("tagged_characters")
      .eq("id", lineId)
      .single();
    const existing = ((line?.tagged_characters as string[] | null) || []).map(String);
    const merged = Array.from(new Set([...existing, ...tokenSet]));
    const { error } = await supabase
      .from("script_lines")
      .update({ tagged_characters: merged })
      .eq("id", lineId);
    if (!error) updated++;
  }

  revalidatePath("/spine");
  return { success: true, updated };
}

export async function addMentionAlias(
  productionId: string,
  characterToken: string,
  alias: string
): Promise<{ error?: string; success?: boolean }> {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("add_mention_alias", {
    p_production_id: productionId,
    p_character_token: characterToken,
    p_alias: alias,
  });
  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}

export async function deleteMentionAlias(
  aliasId: string
): Promise<{ error?: string; success?: boolean }> {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("delete_mention_alias", { p_alias_id: aliasId });
  if (error) return { error: error.message };
  revalidatePath("/spine");
  return { success: true };
}
