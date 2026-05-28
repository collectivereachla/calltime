import { createClient } from "@/lib/supabase/server";
import { CostumeBible } from "./costume-bible";
import { SetDesign } from "./set-design";
import { DesignRoom } from "./design-room";
import { makeLightingConfig, makeSoundConfig } from "./design-configs";
import { BoothTabs } from "./booth-tabs";
import { getActiveProductionId } from "@/lib/active-production";

export default async function BoothPage() {
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

  const isOwnerOrProd = membership.role === "owner" || membership.role === "production";

  // Get active production from cookie
  const activeProductionId = await getActiveProductionId();

  let activeProduction: { id: string; title: string; status: string } | null = null;
  if (activeProductionId) {
    const { data } = await supabase
      .from("productions")
      .select("id, title, status")
      .eq("id", activeProductionId)
      .eq("org_id", (membership.organizations as unknown as { id: string }).id)
      .single();
    activeProduction = data;
  }

  if (!activeProduction) {
    // Fallback to first active production
    const { data: prods } = await supabase
      .from("productions")
      .select("id, title, status")
      .eq("org_id", (membership.organizations as unknown as { id: string }).id)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true })
      .limit(1);
    activeProduction = prods?.[0] || null;
  }

  // Check if user has a design or staff assignment for this production
  let canManage = isOwnerOrProd;
  if (activeProduction && !canManage) {
    const { data: assignment } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("production_id", activeProduction.id)
      .eq("person_id", person!.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (assignment) {
      canManage = ["admin", "production", "staff"].includes(assignment.access_tier) ||
        assignment.department === "design";
    }
  }

  if (!activeProduction) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Booth</h1>
        <p className="text-body-md text-ash">No active productions. The Booth opens during production.</p>
      </div>
    );
  }

  // Get scenes for this production
  const { data: scenesData } = await supabase.rpc("get_production_scenes", {
    p_production_id: activeProduction.id,
  });

  const scenes = (scenesData as unknown as {
    id: string; act: number; scene_number: number; title: string | null;
    description: string | null; character_count: number;
  }[]) || [];

  // Get cast for this production
  const { data: castData } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people(id, full_name, preferred_name, email, phone)")
    .eq("production_id", activeProduction.id)
    .eq("department", "cast")
    .eq("active", true)
    .order("role_title", { ascending: true });

  const cast = (castData || []).filter((a) => a.people != null).map((a) => {
    const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null; email: string | null; phone: string | null };
    return {
      person_id: p.id,
      name: p.preferred_name || p.full_name,
      role_title: a.role_title,
      email: p.email,
      phone: p.phone,
    };
  });

  // Get costume plot entries
  const { data: plotData } = await supabase.rpc("get_costume_plot", {
    p_production_id: activeProduction.id,
  });

  const entries = (plotData as unknown as {
    scene_id: string; person_id: string; character_name: string;
    costume_description: string | null; change_notes: string | null;
    change_location: string | null; status: string; image_url: string | null;
  }[]) || [];

  // Get costume parade entries
  const { data: paradeData } = await supabase
    .from("costume_parade")
    .select("*")
    .eq("production_id", activeProduction.id)
    .order("parade_order", { ascending: true });

  // Get measurements
  const { data: measurementData } = await supabase
    .from("measurements")
    .select("*")
    .eq("production_id", activeProduction.id);

  // Get costume inventory for this org
  const orgId = (membership.organizations as unknown as { id: string }).id;
  const { data: inventoryData } = await supabase
    .from("costume_inventory")
    .select("*")
    .eq("org_id", orgId)
    .order("category", { ascending: true });

  // Get SM-enhanced scenes (with location, used to enrich design scene lists)
  const { data: smScenesData } = await supabase
    .from("scenes")
    .select("*")
    .eq("production_id", activeProduction.id)
    .order("sort_order", { ascending: true });

  // Get set design elements (including spatial data for stage viewer)
  const { data: setElements } = await supabase
    .from("design_elements")
    .select("id, name, description, status, image_url, notes, scene_ids, sort_order, pos_x, pos_y, width_ft, depth_ft, height_ft, rotation, color")
    .eq("production_id", activeProduction.id)
    .eq("department", "set")
    .order("sort_order", { ascending: true });

  // Get set design references
  const { data: setReferences } = await supabase
    .from("design_references")
    .select("id, title, description, image_url, category, created_at")
    .eq("production_id", activeProduction.id)
    .eq("department", "set")
    .order("created_at", { ascending: false });

  // Get stage configuration
  const { data: stageConfig } = await supabase
    .from("stage_configs")
    .select("stage_width, stage_depth, proscenium_width, proscenium_height, grid_size")
    .eq("production_id", activeProduction.id)
    .single();

  // Get design milestones
  const { data: setMilestones } = await supabase
    .from("design_milestones")
    .select("id, milestone, sort_order, completed, completed_at, notes")
    .eq("production_id", activeProduction.id)
    .eq("department", "set")
    .order("sort_order", { ascending: true });

  // Get scene design notes for set
  const sceneIds = scenes.map((s) => s.id);
  let setSceneNotes: { scene_id: string; content: string | null }[] = [];
  if (sceneIds.length > 0) {
    const { data } = await supabase
      .from("scene_design_notes")
      .select("scene_id, content")
      .in("scene_id", sceneIds)
      .eq("department", "set");
    setSceneNotes = data || [];
  }

  // Helper to fetch design data for a department
  async function fetchDeptData(dept: string) {
    const [elemRes, refRes, msRes, cueRes] = await Promise.all([
      supabase
        .from("design_elements")
        .select("id, name, description, status, image_url, notes, scene_ids, sort_order")
        .eq("production_id", activeProduction!.id)
        .eq("department", dept)
        .order("sort_order", { ascending: true }),
      supabase
        .from("design_references")
        .select("id, title, description, image_url, category, created_at")
        .eq("production_id", activeProduction!.id)
        .eq("department", dept)
        .order("created_at", { ascending: false }),
      supabase
        .from("design_milestones")
        .select("id, milestone, sort_order, completed, completed_at, notes")
        .eq("production_id", activeProduction!.id)
        .eq("department", dept)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cues")
        .select("id, cue_number, description, page_ref, scene_id, trigger_line, duration, notes, status, sort_order, metadata")
        .eq("production_id", activeProduction!.id)
        .eq("department", dept)
        .order("sort_order", { ascending: true }),
    ]);
    let deptSceneNotes: { scene_id: string; content: string | null }[] = [];
    if (sceneIds.length > 0) {
      const { data } = await supabase
        .from("scene_design_notes")
        .select("scene_id, content")
        .in("scene_id", sceneIds)
        .eq("department", dept);
      deptSceneNotes = data || [];
    }
    return {
      elements: (elemRes.data || []) as { id: string; name: string; description: string | null; status: string; image_url: string | null; notes: string | null; scene_ids: string[] }[],
      references: (refRes.data || []) as { id: string; title: string; description: string | null; image_url: string; category: string; created_at: string }[],
      milestones: (msRes.data || []) as { id: string; milestone: string; sort_order: number; completed: boolean; completed_at: string | null; notes: string | null }[],
      cues: (cueRes.data || []) as { id: string; cue_number: string; description: string | null; page_ref: string | null; scene_id: string | null; trigger_line: string | null; duration: string | null; notes: string | null; status: string; sort_order: number; metadata: Record<string, unknown> }[],
      sceneNotes: deptSceneNotes,
    };
  }

  const [lightingData, soundData] = await Promise.all([
    fetchDeptData("lights"),
    fetchDeptData("sound"),
  ]);

  // Get designer names from production assignments
  const { data: designAssignments } = await supabase
    .from("production_assignments")
    .select("role_title, people(full_name, preferred_name)")
    .eq("production_id", activeProduction.id)
    .eq("department", "design")
    .eq("active", true);

  function findDesigner(roleLike: string): { name: string | null; role: string | null } {
    const match = (designAssignments || []).find((a) =>
      a.role_title.toLowerCase().includes(roleLike.toLowerCase())
    );
    if (!match || !match.people) return { name: null, role: null };
    const p = match.people as unknown as { full_name: string; preferred_name: string | null };
    return { name: p.preferred_name || p.full_name, role: match.role_title };
  }

  const lightDesigner = findDesigner("light");
  const soundDesigner = findDesigner("sound");
  const costumeDesigner = findDesigner("costume");
  const setDesigner = findDesigner("set");
  const lightingConfig = makeLightingConfig(lightDesigner.name, lightDesigner.role);
  const soundConfig = makeSoundConfig(soundDesigner.name, soundDesigner.role);

  // Build scene list with locations for design rooms
  const designScenes = scenes.map((s) => {
    const full = (smScenesData as unknown as { id: string; location: string | null }[] || []).find((fs) => fs.id === s.id);
    return {
      id: s.id, act: s.act, scene_number: s.scene_number, title: s.title,
      location: full?.location || null,
    };
  });

  return (
    <div className="max-w-full mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-6">
        <div>
          <h1 className="font-display text-display-md text-ink">Booth</h1>
          <p className="text-body-md text-ash mt-1">
            <span className="font-display italic">{activeProduction.title}</span>
            <span className="text-muted"> · {activeProduction.status.replace(/_/g, " ")}</span>
          </p>
        </div>
      </div>

      <BoothTabs
        tabs={[
          { key: "costume", label: "Costume", designer: costumeDesigner.name },
          { key: "set", label: "Set", designer: setDesigner.name },
          { key: "lights", label: "Lights", designer: lightDesigner.name },
          { key: "sound", label: "Sound", designer: soundDesigner.name },
        ]}
        contents={{
          costume: (
            <CostumeBible
              productionId={activeProduction.id}
              scenes={scenes.map((s) => ({
                id: s.id, act: s.act, scene_number: s.scene_number, title: s.title,
              }))}
              cast={cast}
              costumeEntries={entries}
              paradeEntries={(paradeData || []) as any}
              measurementEntries={(measurementData || []) as any}
              inventoryItems={(inventoryData || []) as any}
              canManage={canManage}
            />
          ),
          set: (
            <SetDesign
              productionId={activeProduction.id}
              scenes={designScenes}
              elements={(setElements || []) as any}
              references={(setReferences || []) as any}
              milestones={(setMilestones || []) as any}
              sceneNotes={setSceneNotes}
              stageConfig={stageConfig || null}
              canManage={canManage}
            />
          ),
          lights: (
            <DesignRoom
              config={lightingConfig}
              productionId={activeProduction.id}
              scenes={designScenes}
              elements={lightingData.elements}
              references={lightingData.references}
              milestones={lightingData.milestones}
              cues={lightingData.cues}
              sceneNotes={lightingData.sceneNotes}
              canManage={canManage}
            />
          ),
          sound: (
            <DesignRoom
              config={soundConfig}
              productionId={activeProduction.id}
              scenes={designScenes}
              elements={soundData.elements}
              references={soundData.references}
              milestones={soundData.milestones}
              cues={soundData.cues}
              sceneNotes={soundData.sceneNotes}
              canManage={canManage}
            />
          ),
        }}
      />
    </div>
  );
}
