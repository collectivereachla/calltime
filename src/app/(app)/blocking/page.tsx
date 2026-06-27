import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole, orgIdForProduction, canLeadProduction } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";
import { BlockingMap } from "./blocking-map";

export default async function BlockingPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase
    .from("people").select("id").eq("id", personId!).single();
  const activeProductionId = await getActiveProductionId();
  if (!activeProductionId) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <p className="text-body-md text-ash">No active production selected.</p>
      </div>
    );
  }

  const orgId = await orgIdForProduction(activeProductionId);
  const role = orgId ? await getRoleInOrg(person!.id, orgId) : null;
  const canManage = isLeadershipRole(role) || (await canLeadProduction(person!.id, activeProductionId));

  const { data: production } = await supabase
    .from("productions").select("id, title").eq("id", activeProductionId).single();

  // Resolve THIS production's active script (working/unlocked, else most recent),
  // exactly like Spine. Never a hardcoded id — every org's Blocking room must read
  // its own script. Falls back to a non-matching id so an org with no script yet
  // simply shows scenes with no characters instead of another org's script.
  const { data: scriptRows } = await supabase
    .from("scripts")
    .select("id, is_locked, created_at")
    .eq("production_id", activeProductionId)
    .order("created_at", { ascending: false });
  const blockingScriptId =
    scriptRows?.find((sc) => !sc.is_locked)?.id ||
    scriptRows?.[0]?.id ||
    "00000000-0000-0000-0000-000000000000";

  // Scenes
  const { data: scenes } = await supabase
    .from("scenes").select("id, act, scene_number, title")
    .eq("production_id", activeProductionId)
    .order("sort_order", { ascending: true });

  // Characters from script data ONLY: dialogue, blocking tags, stage direction tags
  // No cast role_titles (they contain garbage like "Featured Dancer", "TEST", doublings)
  const charSet = new Set<string>();

  // 1. Speaking characters + stage direction tags from script lines
  const { data: charRows } = await supabase
    .from("script_lines")
    .select("character, tagged_characters")
    .eq("script_id", blockingScriptId);
  for (const r of charRows || []) {
    if (r.character) charSet.add(r.character);
    if (r.tagged_characters) for (const t of r.tagged_characters as string[]) charSet.add(t);
  }

  // 2. Characters tagged in blocking notes (filtered to this script only)
  const lineIds = (charRows || []).map(() => "").length > 0
    ? await supabase.from("script_lines").select("id").eq("script_id", blockingScriptId)
    : { data: [] };

  if (lineIds.data && lineIds.data.length > 0) {
    const { data: annChars } = await supabase
      .from("script_annotations")
      .select("tagged_characters")
      .in("script_line_id", lineIds.data.map((l) => l.id))
      .not("tagged_characters", "eq", "{}");
    for (const a of annChars || []) {
      if (a.tagged_characters) for (const t of a.tagged_characters as string[]) charSet.add(t);
    }
  }

  // Remove meta-characters
  charSet.delete("ALL");
  charSet.delete("BOTH");
  const characters = [...charSet].sort();

  // Stage config
  const { data: stageConfig } = await supabase
    .from("stage_configs").select("*").eq("production_id", activeProductionId).single();

  // Blocking moments + positions
  const { data: moments } = await supabase
    .from("blocking_moments")
    .select("id, scene_id, script_line_id, sort_order, label, notes")
    .eq("production_id", activeProductionId)
    .order("sort_order", { ascending: true });

  let positionsByMoment: Record<string, { character_name: string; x: number; y: number; on_stage: boolean; stage_area: string | null; entrance_from: string | null; exit_to: string | null }[]> = {};

  if (moments && moments.length > 0) {
    const { data: allPositions } = await supabase
      .from("blocking_positions")
      .select("moment_id, character_name, x, y, on_stage, stage_area, entrance_from, exit_to")
      .in("moment_id", moments.map((m) => m.id));

    for (const p of allPositions || []) {
      if (!positionsByMoment[p.moment_id]) positionsByMoment[p.moment_id] = [];
      positionsByMoment[p.moment_id].push(p);
    }
  }

  // Script lines for linking moments to lines
  const { data: scriptLines } = await supabase
    .from("script_lines")
    .select("id, line_number, act, scene, character, content, line_type")
    .eq("script_id", blockingScriptId)
    .order("line_number", { ascending: true });

  // Cast assignments for actor names → character mapping
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people(full_name, preferred_name)")
    .eq("production_id", activeProductionId)
    .eq("department", "cast")
    .eq("active", true);

  return (
    <BlockingMap
      production={production!}
      scenes={scenes || []}
      characters={characters}
      stageConfig={stageConfig}
      moments={moments || []}
      positionsByMoment={positionsByMoment}
      scriptLines={(scriptLines || []).map((l) => ({
        id: l.id, lineNumber: l.line_number, act: l.act, scene: l.scene,
        character: l.character, content: l.content, lineType: l.line_type,
      }))}
      castAssignments={(assignments || []).filter(a => a.people).map((a) => {
        const p = a.people as unknown as { full_name: string; preferred_name: string | null };
        return { role: a.role_title, actorName: p.preferred_name || p.full_name };
      })}
      canManage={canManage}
    />
  );
}
