import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { CostumeBible } from "./costume-bible";
import { SetDesign } from "./set-design";
import { DesignRoom } from "./design-room";
import { makeLightingConfig, makeSoundConfig } from "./design-configs";
import { BoothTabs } from "./booth-tabs";
import { PropsInventoryTab } from "./props-inventory-tab";
import { MicPlot } from "./mic-plot";
import { VideoRoom } from "./video-room";
import { DesignQA } from "./design-qa";
import { RiderTab } from "./rider-tab";
import { buildAutoBodies } from "./rider-data";
import { getActiveProductionId } from "@/lib/active-production";

export default async function BoothPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId!)
    .single();

  // A person has memberships (plural). Resolve the set, then derive the
  // active org from the selected show below — never assume a single "home" org.
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(id, name, inventory_house_owner)")
    .eq("person_id", person!.id);

  // Provisional membership for org-scoped fallbacks; the real org is derived
  // from the active production once it's resolved.
  const membership = (memberships || [])[0];

  if (!membership) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const orgIds = (memberships || [])
    .map((m) => (m.organizations as unknown as { id: string } | null)?.id)
    .filter((id): id is string => !!id);
  const roleByOrg = new Map<string, string>();
  for (const m of memberships || []) {
    const oid = (m.organizations as unknown as { id: string } | null)?.id;
    if (oid) roleByOrg.set(oid, m.role);
  }

  // Get active production from cookie. Validate against EVERY org the person
  // can see, then derive the org from the selected show (never the reverse).
  const activeProductionId = await getActiveProductionId();

  let activeProduction: { id: string; title: string; status: string; org_id: string } | null = null;
  if (activeProductionId) {
    const { data } = await supabase
      .from("productions")
      .select("id, title, status, org_id")
      .eq("id", activeProductionId)
      .in("org_id", orgIds)
      .single();
    activeProduction = data;
  }

  if (!activeProduction) {
    // Fallback to the soonest-opening active production across all orgs.
    const { data: prods } = await supabase
      .from("productions")
      .select("id, title, status, org_id")
      .in("org_id", orgIds)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true })
      .limit(1);
    activeProduction = prods?.[0] || null;
  }

  // Org and role derive from the SELECTED show, not a presumed home org.
  const activeOrgId = activeProduction?.org_id || null;
  const activeRole = activeOrgId ? roleByOrg.get(activeOrgId) || membership.role : membership.role;
  const isOwnerOrProd = activeRole === "owner" || activeRole === "production";
  const isAdmin = activeRole === "admin";

  // Determine access. The Booth is the design/production team's room; cast
  // members must not see other people's costumes, assignments, or measurements.
  // Check EVERY active assignment (not just one) so a person who is both cast
  // and design (or video) still gets in.
  let canManage = isOwnerOrProd;
  let canAccessBooth = isOwnerOrProd || isAdmin;
  if (activeProduction && (!canManage || !canAccessBooth)) {
    const { data: assignments } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("production_id", activeProduction.id)
      .eq("person_id", person!.id)
      .eq("active", true);

    // Band/music get Booth VIEW + Q&A, but not edit. Edit (canManage) stays with
    // designers, video, and production/admin/staff tiers — which includes the
    // Music Director (production tier), so she can edit while the players cannot.
    const canManageHere = (assignments || []).some(
      (a) =>
        ["admin", "production", "staff"].includes(a.access_tier) ||
        a.department === "design" ||
        a.department === "video"
    );
    const canViewHere =
      canManageHere || (assignments || []).some((a) => a.department === "music");
    if (canManageHere) canManage = true;
    if (canViewHere) canAccessBooth = true;
  }

  if (!activeProduction) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Booth</h1>
        <p className="text-body-md text-ash">No active productions. The Booth opens during production.</p>
      </div>
    );
  }

  if (!canAccessBooth) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md text-ink mb-2">Booth</h1>
        <p className="text-body-md text-ash">
          The Booth is the design and production team&apos;s room — costume, set, lighting, and sound.
          Your schedule, script, and costume assignments live on your Home page.
        </p>
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

  // Musicians (band) — for assigning instrument inputs on the mic plot
  const { data: musicData } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people(id, full_name, preferred_name)")
    .eq("production_id", activeProduction.id)
    .eq("department", "music")
    .eq("active", true)
    .order("role_title", { ascending: true });

  const musicians = (musicData || []).filter((a) => a.people != null).map((a) => {
    const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null };
    return { person_id: p.id, name: p.preferred_name || p.full_name, role_title: a.role_title };
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

  // Get costume inventory for this org — scoped to the SELECTED show's org.
  const orgId = activeProduction.org_id;

  // ── Designer Q&A: load questions + replies for this production ──
  // Who can resolve/close items: SM, director, and org leadership.
  let canResolveQA = isOwnerOrProd;
  if (!canResolveQA) {
    const { data: leadAsg } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("production_id", activeProduction.id)
      .eq("person_id", person!.id)
      .eq("active", true);
    canResolveQA = (leadAsg || []).some(
      (a) =>
        ["admin", "owner", "production"].includes(a.access_tier) ||
        ["stage_management", "directing"].includes(a.department)
    );
  }

  const { data: qaQuestions } = await supabase
    .from("design_questions")
    .select("id, scene_id, script_line_id, department, author_person_id, body, status, resolved_at, created_at, author:people!design_questions_author_person_id_fkey(id, full_name, preferred_name)")
    .eq("production_id", activeProduction.id)
    .order("created_at", { ascending: false });

  const qaQuestionIds = (qaQuestions || []).map((q) => q.id);
  let qaReplies: unknown[] = [];
  if (qaQuestionIds.length > 0) {
    const { data: r } = await supabase
      .from("design_question_replies")
      .select("id, question_id, author_person_id, body, created_at, author:people!design_question_replies_author_person_id_fkey(id, full_name, preferred_name)")
      .in("question_id", qaQuestionIds)
      .order("created_at", { ascending: true });
    qaReplies = r || [];
  }
  const openQACount = (qaQuestions || []).filter((q) => q.status === "open").length;

  const activeOrg = (memberships || [])
    .map((m) => m.organizations as unknown as { id: string; name: string; inventory_house_owner: string | null } | null)
    .find((o) => o?.id === orgId) || null;
  const { data: inventoryData } = await supabase
    .from("costume_inventory")
    .select("*")
    .eq("org_id", orgId)
    .order("category", { ascending: true });

  // Multi-actor assignments for this production (one item can go to several actors)
  const { data: costumeAssignmentRows } = await supabase
    .from("costume_assignments")
    .select("item_id, person_id")
    .eq("production_id", activeProduction.id);

  const assigneesByItem = new Map<string, string[]>();
  for (const r of (costumeAssignmentRows || []) as { item_id: string; person_id: string }[]) {
    const arr = assigneesByItem.get(r.item_id) || [];
    arr.push(r.person_id);
    assigneesByItem.set(r.item_id, arr);
  }
  const inventoryItems = (inventoryData || []).map((it) => ({
    ...it,
    assignedPersonIds: assigneesByItem.get(it.id) || [],
  }));

  // Org people — for the inventory owner picker (an owner may be staff, not cast)
  const { data: orgPeopleData } = await supabase
    .from("org_memberships")
    .select("people(id, full_name, preferred_name)")
    .eq("org_id", orgId)
    .eq("status", "active");

  const orgPeople = (orgPeopleData || [])
    .map((m) => m.people as unknown as { id: string; full_name: string; preferred_name: string | null } | null)
    .filter((p): p is { id: string; full_name: string; preferred_name: string | null } => !!p)
    .map((p) => ({ id: p.id, name: p.preferred_name || p.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Props inventory (org-level owned stock; distinct from per-show prop tracking in Run)
  const { data: propsInventoryData } = await supabase
    .from("props_inventory")
    .select("*")
    .eq("org_id", orgId)
    .order("category", { ascending: true });

  // Multi-actor assignments for props in this production
  const { data: propAssignmentRows } = await supabase
    .from("prop_assignments")
    .select("item_id, person_id")
    .eq("production_id", activeProduction.id);

  const propAssigneesByItem = new Map<string, string[]>();
  for (const r of (propAssignmentRows || []) as { item_id: string; person_id: string }[]) {
    const arr = propAssigneesByItem.get(r.item_id) || [];
    arr.push(r.person_id);
    propAssigneesByItem.set(r.item_id, arr);
  }
  const propsInventoryItems = (propsInventoryData || []).map((it) => ({
    ...it,
    assignedPersonIds: propAssigneesByItem.get(it.id) || [],
  }));

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
    .select("id, title, description, image_url, category, created_at, file_name, mime_type")
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
        .select("id, title, description, image_url, category, created_at, file_name, mime_type")
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

  // Wireless mics + their actor assignments for this production
  const { data: micRows } = await supabase
    .from("wireless_mics")
    .select("*")
    .eq("production_id", activeProduction.id);
  const { data: micAssignRows } = await supabase
    .from("mic_assignments")
    .select("mic_id, person_id")
    .eq("production_id", activeProduction.id);
  const micAssigneesByMic = new Map<string, string[]>();
  for (const r of (micAssignRows || []) as { mic_id: string; person_id: string }[]) {
    const arr = micAssigneesByMic.get(r.mic_id) || [];
    arr.push(r.person_id);
    micAssigneesByMic.set(r.mic_id, arr);
  }
  const mics = (micRows || []).map((m) => ({
    ...m,
    assignedPersonIds: micAssigneesByMic.get(m.id) || [],
  }));

  // Get designer names from production assignments
  const { data: designAssignments } = await supabase
    .from("production_assignments")
    .select("role_title, people(id, full_name, preferred_name)")
    .eq("production_id", activeProduction.id)
    .eq("department", "design")
    .eq("active", true);

  function findDesigner(roleLike: string): { name: string | null; role: string | null } {
    const matches = (designAssignments || []).filter(
      (a) => a.role_title.toLowerCase().includes(roleLike.toLowerCase()) && a.people
    );
    if (matches.length === 0) return { name: null, role: null };
    const names = matches.map((m) => {
      const p = m.people as unknown as { full_name: string; preferred_name: string | null };
      return p.preferred_name || p.full_name;
    });
    return { name: names.join(" & "), role: matches[0].role_title };
  }

  // The production's costume designer, as an owner option for inventory
  function findDesignerPerson(roleLike: string): { id: string; name: string } | null {
    const match = (designAssignments || []).find((a) =>
      a.role_title.toLowerCase().includes(roleLike.toLowerCase())
    );
    if (!match || !match.people) return null;
    const p = match.people as unknown as { id: string; full_name: string; preferred_name: string | null };
    return { id: p.id, name: p.preferred_name || p.full_name };
  }
  const costumeDesignerOwner = findDesignerPerson("costume");
  const houseOwner =
    activeOrg?.inventory_house_owner
    || activeOrg?.name
    || "House stock";

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

  // ---- Video room data ----
  const { data: videoCrewData } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people(id, full_name, preferred_name, email, phone)")
    .eq("production_id", activeProduction.id)
    .eq("department", "video")
    .eq("active", true)
    .order("role_title", { ascending: true });

  const videoCrew = (videoCrewData || []).filter((a) => a.people != null).map((a) => {
    const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null; email: string | null; phone: string | null };
    return {
      person_id: p.id,
      name: p.preferred_name || p.full_name,
      role_title: a.role_title,
      email: p.email,
      phone: p.phone,
    };
  });

  const [videoShotsRes, videoDelivRes, videoReleasesRes, videoRefsRes] = await Promise.all([
    supabase.from("video_shots").select("*").eq("production_id", activeProduction.id),
    supabase.from("video_deliverables").select("*").eq("production_id", activeProduction.id),
    supabase.from("video_releases").select("*").eq("production_id", activeProduction.id).order("created_at", { ascending: true }),
    supabase.from("design_references")
      .select("id, title, description, image_url, category, created_at, file_name, mime_type")
      .eq("production_id", activeProduction.id)
      .eq("department", "video")
      .order("created_at", { ascending: false }),
  ]);

  const [riderSectionsRes, riderAutoBodies] = await Promise.all([
    supabase.from("rider_sections")
      .select("id, sort_order, title, kind, source, body")
      .eq("production_id", activeProduction.id)
      .order("sort_order"),
    buildAutoBodies(supabase, activeProduction.id),
  ]);
  const riderSections = riderSectionsRes.data || [];

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
          { key: "props", label: "Props" },
          { key: "set", label: "Set", designer: setDesigner.name },
          { key: "lights", label: "Lights", designer: lightDesigner.name },
          { key: "sound", label: "Sound", designer: soundDesigner.name },
          { key: "video", label: "Video" },
          { key: "rider", label: "Rider" },
          { key: "qa", label: openQACount > 0 ? `Q&A (${openQACount})` : "Q&A" },
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
              inventoryItems={inventoryItems as any}
              canManage={canManage}
              orgId={orgId}
              orgPeople={orgPeople}
              houseOwner={houseOwner}
              costumeDesigner={costumeDesignerOwner}
            />
          ),
          props: (
            <PropsInventoryTab
              items={propsInventoryItems as any}
              orgId={orgId}
              orgPeople={orgPeople}
              cast={cast}
              productionId={activeProduction.id}
              canManage={canManage}
              houseOwner={houseOwner}
              costumeDesigner={costumeDesignerOwner}
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
            <div className="space-y-8">
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
              <MicPlot
                productionId={activeProduction.id}
                mics={mics as any}
                cast={cast}
                musicians={musicians}
                canManage={canManage}
              />
            </div>
          ),
          video: (
            <VideoRoom
              productionId={activeProduction.id}
              scenes={scenes.map((s) => ({ id: s.id, act: s.act, scene_number: s.scene_number, title: s.title }))}
              crew={videoCrew}
              orgPeople={orgPeople}
              shots={(videoShotsRes.data || []) as any}
              deliverables={(videoDelivRes.data || []) as any}
              releases={(videoReleasesRes.data || []) as any}
              references={(videoRefsRes.data || []) as any}
              canManage={canManage}
            />
          ),
          rider: (
            <RiderTab
              productionId={activeProduction.id}
              productionTitle={activeProduction.title}
              sections={riderSections as never}
              autoBodies={riderAutoBodies}
              canManage={canManage}
            />
          ),
          qa: (
            <DesignQA
              productionId={activeProduction.id}
              viewerPersonId={person!.id}
              canResolve={canResolveQA}
              scenes={scenes.map((s) => ({ id: s.id, act: s.act, scene_number: s.scene_number, title: s.title }))}
              questions={(qaQuestions || []) as never}
              replies={qaReplies as never}
            />
          ),
        }}
      />
    </div>
  );
}
