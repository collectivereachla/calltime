import { createClient } from "@/lib/supabase/server";
import { SpineViewer } from "./spine-viewer";

export default async function SpinePage() {
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

  // Get active productions
  const { data: productions } = await supabase
    .from("productions")
    .select("id, title")
    .eq("org_id", orgId)
    .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
    .order("opening_date", { ascending: true });

  const productionIds = productions?.map((p) => p.id) || [];

  // Get scripts for these productions
  let scripts: {
    id: string;
    title: string;
    version: string;
    production_id: string;
    productions: { title: string };
  }[] = [];

  if (productionIds.length > 0) {
    const { data } = await supabase
      .from("scripts")
      .select("id, title, version, production_id, productions(title)")
      .in("production_id", productionIds);

    scripts = (data as unknown as typeof scripts) || [];
  }

  // If we have scripts, load scenes for the first one
  let scenes: {
    id: string;
    act: number;
    scene: number;
    title: string | null;
    setting: string | null;
    content: string;
    sort_order: number;
  }[] = [];

  const activeScript = scripts[0] || null;

  if (activeScript) {
    const { data } = await supabase
      .from("script_scenes")
      .select("id, act, scene, title, setting, content, sort_order")
      .eq("script_id", activeScript.id)
      .order("sort_order", { ascending: true });

    scenes = data || [];
  }

  // Get user's character assignments for this production
  let myCharacters: string[] = [];
  if (activeScript) {
    const { data: assignments } = await supabase
      .from("production_assignments")
      .select("role_title")
      .eq("production_id", activeScript.production_id)
      .eq("person_id", person!.id);

    myCharacters = assignments?.map((a) => a.role_title) || [];
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink">Spine</h1>
        <p className="text-body-md text-ash mt-1">
          {activeScript
            ? `${activeScript.title} — ${(activeScript.productions as unknown as { title: string }).title}`
            : "The interpretive layer."}
        </p>
      </div>

      {!activeScript ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash mb-2">No script imported yet.</p>
          {canManage && (
            <p className="text-body-sm text-muted">
              Script import is coming soon. The script for The Juneteenth Story is ready to be loaded.
            </p>
          )}
        </div>
      ) : scenes.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">
            Script record exists but no scenes have been imported yet.
          </p>
        </div>
      ) : (
        <SpineViewer
          scenes={scenes}
          scriptTitle={activeScript.title}
          myCharacters={myCharacters}
          canManage={canManage}
        />
      )}
    </div>
  );
}
