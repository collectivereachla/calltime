import { createClient } from "@/lib/supabase/server";
import { SpineLayout } from "./spine-layout";
import { getActiveProductionId } from "@/lib/active-production";
import { orgIdForProduction, resolveActingOrgId, getRoleInOrg, isLeadershipRole } from "@/lib/membership";

interface SearchParams {
  v?: string;
}

export default async function SpinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  // Resolve the org from the SELECTED show, not an arbitrary membership. The
  // old limit(1).single() picked one org (BTE); when a SWLA show was active it
  // was rejected and Spine fell back to BTE's first active production (TJS).
  const activeProductionId = await getActiveProductionId();
  let orgId: string | null = activeProductionId
    ? await orgIdForProduction(activeProductionId)
    : null;
  if (!orgId) orgId = await resolveActingOrgId(person!.id);

  if (!orgId) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">Select a production to open its script.</p>
      </div>
    );
  }

  const canManage = isLeadershipRole(await getRoleInOrg(person!.id, orgId));

  // Which production's script: the selected one if it belongs to this org,
  // otherwise the org's first active production.
  let productionIds: string[] = [];

  if (activeProductionId) {
    const { data } = await supabase
      .from("productions")
      .select("id")
      .eq("id", activeProductionId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (data) productionIds = [data.id];
  }

  if (productionIds.length === 0) {
    const { data: prods } = await supabase
      .from("productions")
      .select("id")
      .eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true })
      .limit(1);
    productionIds = prods?.map(p => p.id) || [];
  }

  // Fetch all versions for version selector
  let versions: {
    id: string;
    title: string;
    version: string;
    is_locked: boolean;
    version_notes: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_at: string;
    line_count: number;
    annotation_count: number;
  }[] = [];

  if (productionIds.length > 0) {
    const { data } = await supabase.rpc("get_script_versions", {
      p_production_id: productionIds[0],
    });
    versions = (data as typeof versions) || [];
  }

  // Determine which version to show
  const requestedVersionId = params.v;
  let activeScript: { id: string; title: string; version: string; is_locked: boolean } | null = null;

  if (requestedVersionId) {
    const found = versions.find((v) => v.id === requestedVersionId);
    if (found) {
      activeScript = {
        id: found.id,
        title: found.title,
        version: found.version,
        is_locked: found.is_locked,
      };
    }
  }

  // Default to the working (unlocked) version
  if (!activeScript) {
    const working = versions.find((v) => !v.is_locked);
    if (working) {
      activeScript = {
        id: working.id,
        title: working.title,
        version: working.version,
        is_locked: working.is_locked,
      };
    }
  }

  let lines: {
    id: string;
    line_number: number;
    act: number;
    scene: number;
    line_type: string;
    character: string | null;
    content: string;
    tagged_characters: string[] | null;
  }[] = [];

  if (activeScript) {
    const { data } = await supabase
      .from("script_lines")
      .select("id, line_number, act, scene, line_type, character, content, tagged_characters")
      .eq("script_id", activeScript.id)
      .order("line_number", { ascending: true });
    lines = data || [];
  }

  let sceneMeta: { act: number; scene: number; title: string | null; setting: string | null }[] = [];
  if (activeScript) {
    const { data } = await supabase
      .from("script_scenes")
      .select("act, scene, title, setting")
      .eq("script_id", activeScript.id)
      .order("sort_order", { ascending: true });
    sceneMeta = data || [];
  }

  let annotations: {
    id: string;
    script_line_id: string;
    person_id: string;
    annotation_type: string;
    content: string;
    tagged_characters: string[];
    visibility: string;
    note_type: string;
    is_pinned: boolean;
    cue_start: number | null;
    cue_end: number | null;
    cue_text: string | null;
    created_at: string;
    updated_at: string;
  }[] = [];

  if (activeScript && lines.length > 0) {
    const { data } = await supabase.rpc("get_script_annotations", {
      p_script_id: activeScript.id,
    });
    annotations = data || [];
  }

  // Character universe for tagging/filtering: not just who has spoken dialogue,
  // but everyone in the cast and anyone already tagged on a line. Otherwise a
  // character with no lines yet (mid-import) can't be tagged and existing tags
  // on stage directions have no chip to show. Normalize to upper-case (the
  // script's convention) and dedupe case-insensitively.
  const charKeys = new Map<string, string>();
  const addChar = (raw: string | null | undefined) => {
    if (!raw) return;
    // Cast roles are often combined ("John / Daddy", "Peaches / Imani") — split
    // into the individual character names so each one is taggable on its own.
    for (const piece of raw.split(" / ")) {
      const c = piece.trim();
      if (!c || c === "ALL" || c === "BOTH") continue;
      // Skip ensemble/utility labels like "Featured Dancer (Belle)".
      if (c.includes("(")) continue;
      const key = c.toUpperCase();
      if (!charKeys.has(key)) charKeys.set(key, key);
    }
  };
  for (const l of lines) {
    addChar(l.character);
    for (const t of ((l as { tagged_characters?: string[] }).tagged_characters) || []) addChar(t);
  }
  if (productionIds.length > 0) {
    const { data: castRoles } = await supabase
      .from("production_assignments")
      .select("role_title")
      .in("production_id", productionIds)
      .eq("department", "cast")
      .eq("active", true);
    for (const r of castRoles || []) addChar(r.role_title);
  }
  const allCharacters = Array.from(charKeys.values()).sort();

  let myCharacters: string[] = [];
  if (activeScript && productionIds.length > 0) {
    const { data: assignments } = await supabase
      .from("production_assignments")
      .select("role_title")
      .eq("production_id", productionIds[0])
      .eq("person_id", person!.id);
    myCharacters = assignments?.map((a) => a.role_title) || [];
  }

  // Per-production mention alias map (e.g. JJ → JEREMY, Annie Will → MAMA).
  // Powers the quiet mentions tagging pass and the "mentioned in" filter:
  // a tag stored as a canonical character OR one of its aliases counts as
  // that character, so legacy/alias tags still resolve to the right actor.
  const aliasesByCharacter: Record<string, string[]> = {};
  const aliasRows: { id: string; character_token: string; alias: string }[] = [];
  if (productionIds.length > 0) {
    const { data: rows } = await supabase
      .from("mention_aliases")
      .select("id, character_token, alias")
      .eq("production_id", productionIds[0])
      .order("character_token", { ascending: true });
    for (const r of rows || []) {
      aliasRows.push({
        id: r.id as string,
        character_token: r.character_token as string,
        alias: r.alias as string,
      });
      const key = (r.character_token as string).toUpperCase();
      if (!aliasesByCharacter[key]) aliasesByCharacter[key] = [];
      aliasesByCharacter[key].push(r.alias as string);
    }
  }

  // Line notes for this production (capture/review/delivery live in Spine).
  let lineNotes: {
    id: string;
    person_id: string;
    actor_name: string;
    author_name: string | null;
    script_line_id: string | null;
    scene_ref: string | null;
    line_ref: string | null;
    category: string;
    note_type: string;
    content: string;
    marked_text: string | null;
    given_to_actor: boolean;
    corrected_at: string | null;
    created_at: string;
  }[] = [];

  if (productionIds.length > 0) {
    const { data } = await supabase
      .from("line_notes")
      .select("*, actor:person_id(full_name, preferred_name), author:created_by(full_name, preferred_name)")
      .eq("production_id", productionIds[0])
      .order("created_at", { ascending: false })
      .limit(300);
    lineNotes = (data || []).map((n) => {
      const actor = n.actor as unknown as { full_name: string; preferred_name: string | null } | null;
      const author = n.author as unknown as { full_name: string; preferred_name: string | null } | null;
      return {
        id: n.id,
        person_id: n.person_id,
        actor_name: actor?.preferred_name || actor?.full_name || "Unknown",
        author_name: author?.preferred_name || author?.full_name || null,
        script_line_id: n.script_line_id,
        scene_ref: n.scene_ref,
        line_ref: n.line_ref,
        category: n.category,
        note_type: n.note_type,
        content: n.content,
        marked_text: n.marked_text,
        given_to_actor: n.given_to_actor,
        corrected_at: n.corrected_at,
        created_at: n.created_at,
      };
    });
  }

  // Cast roster — used for the manager "preview as actor" control in Line Notes.
  let cast: { person_id: string; name: string; role_title: string }[] = [];
  if (productionIds.length > 0) {
    const { data: castData } = await supabase
      .from("production_assignments")
      .select("person_id, role_title, people(full_name, preferred_name)")
      .eq("production_id", productionIds[0])
      .eq("department", "cast")
      .eq("active", true)
      .order("role_title", { ascending: true });
    cast = (castData || []).filter((c) => c.people).map((c) => {
      const p = c.people as unknown as { full_name: string; preferred_name: string | null };
      return { person_id: c.person_id, name: p.preferred_name || p.full_name, role_title: c.role_title };
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink">Spine</h1>
        <p className="text-body-md text-ash mt-1">
          {activeScript
            ? `${activeScript.title}`
            : "The interpretive layer."}
        </p>
      </div>

      {!activeScript ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <span className="text-3xl mb-3 opacity-40">📜</span>
          <h3 className="font-display text-display-sm text-ink mb-2">Script not loaded yet</h3>
          <p className="text-body-sm text-ash max-w-md leading-relaxed">
            {canManage
              ? "The script hasn't been imported for this production. Contact your admin to get the script loaded."
              : "When the script is ready, you'll find your lines, blocking notes, and line-learning tools here."}
          </p>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <span className="text-3xl mb-3 opacity-40">📜</span>
          <h3 className="font-display text-display-sm text-ink mb-2">Script is being prepared</h3>
          <p className="text-body-sm text-ash max-w-md leading-relaxed">
            The script record exists but scenes are still being imported. Check back soon.
          </p>
        </div>
      ) : (
        <SpineLayout
          lines={lines}
          sceneMeta={sceneMeta}
          annotations={annotations}
          scriptTitle={activeScript.title}
          scriptId={activeScript.id}
          myCharacters={myCharacters}
          allCharacters={allCharacters}
          canManage={canManage}
          personId={person!.id}
          versions={versions}
          activeVersionId={activeScript.id}
          isLocked={activeScript.is_locked}
          productionId={productionIds[0]}
          lineNotes={lineNotes}
          cast={cast}
          aliasesByCharacter={aliasesByCharacter}
          aliasRows={aliasRows}
        />
      )}
    </div>
  );
}
