import { createClient } from "@/lib/supabase/server";
import { CostumePlot } from "./costume-plot";

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

  const canManage = membership.role === "owner" || membership.role === "production";

  // Get active productions with their assignments
  const { data: productions } = await supabase
    .from("productions")
    .select("id, title, status")
    .eq("org_id", (membership.organizations as unknown as { id: string }).id)
    .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
    .order("opening_date", { ascending: true });

  // Default to first active production
  const activeProduction = productions?.[0];

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
    .select("person_id, role_title, people(id, full_name, preferred_name)")
    .eq("production_id", activeProduction.id)
    .eq("department", "cast")
    .eq("active", true)
    .order("role_title", { ascending: true });

  const cast = (castData || []).map((a) => {
    const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null };
    return {
      person_id: p.id,
      name: p.preferred_name || p.full_name,
      role_title: a.role_title,
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

  return (
    <div className="max-w-full mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-6">
        <div>
          <h1 className="font-display text-display-md text-ink">Booth</h1>
          <p className="text-body-md text-ash mt-1">
            <span className="font-display italic">{activeProduction.title}</span>
            <span className="text-muted"> · {activeProduction.status.replace(/_/g, " ")}</span>
          </p>
        </div>
        {productions && productions.length > 1 && (
          <div className="text-body-xs text-muted">
            {productions.length} active productions
          </div>
        )}
      </div>

      {/* Department tabs */}
      <div className="flex gap-1 mb-6 border-b border-bone pb-2">
        <span className="px-4 py-2 text-body-sm font-medium bg-ink text-paper rounded-t-card">
          Costume Design
        </span>
        <span className="px-4 py-2 text-body-sm text-muted cursor-default" title="Coming soon">
          Stage Management
        </span>
        <span className="px-4 py-2 text-body-sm text-muted cursor-default" title="Coming soon">
          Lighting
        </span>
        <span className="px-4 py-2 text-body-sm text-muted cursor-default" title="Coming soon">
          Sound
        </span>
      </div>

      {/* Costume Design */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-body-md font-medium text-ink">Costume Plot</h2>
            <p className="text-body-xs text-ash mt-0.5">
              {cast.length} cast · {scenes.length} scenes · Click any cell to add or edit a costume
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-body-xs text-muted">
              {entries.filter((e) => e.status === "ready").length}/{entries.length} ready
            </span>
          </div>
        </div>

        <CostumePlot
          productionId={activeProduction.id}
          scenes={scenes.map((s) => ({
            id: s.id,
            act: s.act,
            scene_number: s.scene_number,
            title: s.title,
          }))}
          cast={cast}
          entries={entries}
        />
      </div>
    </div>
  );
}
