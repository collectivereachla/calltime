import { createClient } from "@/lib/supabase/server";
import { SpineLayout } from "./spine-layout";
import { getActiveProductionId } from "@/lib/active-production";

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

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(id, name)")
    .eq("person_id", person!.id)
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const canManage = membership.role === "owner" || membership.role === "production";
  const orgId = (membership.organizations as unknown as { id: string }).id;

  // Get active production from cookie
  const activeProductionId = await getActiveProductionId();
  let productionIds: string[] = [];

  if (activeProductionId) {
    // Verify this production belongs to the org
    const { data } = await supabase
      .from("productions")
      .select("id")
      .eq("id", activeProductionId)
      .eq("org_id", orgId)
      .single();
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
    created_at: string;
    updated_at: string;
  }[] = [];

  if (activeScript && lines.length > 0) {
    const { data } = await supabase.rpc("get_script_annotations", {
      p_script_id: activeScript.id,
    });
    annotations = data || [];
  }

  const allCharacters = Array.from(
    new Set(
      lines
        .map((l) => l.character)
        .filter((c): c is string => c !== null && c !== "ALL" && c !== "BOTH" && !c.includes(" / "))
    )
  ).sort();

  let myCharacters: string[] = [];
  if (activeScript && productionIds.length > 0) {
    const { data: assignments } = await supabase
      .from("production_assignments")
      .select("role_title")
      .eq("production_id", productionIds[0])
      .eq("person_id", person!.id);
    myCharacters = assignments?.map((a) => a.role_title) || [];
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
        />
      )}
    </div>
  );
}
