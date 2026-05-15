import { createClient } from "@/lib/supabase/server";
import { CostumeBible } from "./costume-bible";
import { StageManagement } from "./stage-management";
import { BoothTabs } from "./booth-tabs";

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

  // Get SM-enhanced scenes (with characters, props, watchouts)
  const { data: smScenesData } = await supabase
    .from("scenes")
    .select("*")
    .eq("production_id", activeProduction.id)
    .order("sort_order", { ascending: true });

  // Get props
  const { data: propsData } = await supabase
    .from("props")
    .select("*")
    .eq("production_id", activeProduction.id);

  // Get SM reports
  const { data: reportsData } = await supabase
    .from("sm_reports")
    .select("*")
    .eq("production_id", activeProduction.id)
    .order("report_date", { ascending: false });

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
        costumeContent={
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
        }
        smContent={
          <StageManagement
            scenes={(smScenesData || []) as any}
            props={(propsData || []) as any}
            reports={(reportsData || []) as any}
            productionId={activeProduction.id}
            productionTitle={activeProduction.title}
          />
        }
      />
    </div>
  );
}
