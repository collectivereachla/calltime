import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getActiveProductionId } from "@/lib/active-production";
import { orgIdForProduction, resolveActingOrgId } from "@/lib/membership";
import { RunLines, type Line } from "./run-lines";

export const dynamic = "force-dynamic";

function Empty({ msg }: { msg: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-10">
      <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Run Lines</p>
      <h1 className="font-display text-display-md text-ink mb-2">Run Lines</h1>
      <p className="text-body-md text-ash">{msg}</p>
    </div>
  );
}

export default async function LinesPage() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);

  const activeProductionId = await getActiveProductionId();
  let orgId = activeProductionId ? await orgIdForProduction(activeProductionId) : null;
  if (!orgId && personId) orgId = await resolveActingOrgId(personId);

  let productionId = activeProductionId || null;
  if (!productionId && orgId) {
    const { data: prods } = await supabase
      .from("productions").select("id").eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true }).limit(1);
    productionId = prods?.[0]?.id ?? null;
  }

  if (!productionId) return <Empty msg="Select a production to run its lines." />;

  const { data: script } = await supabase
    .from("scripts").select("id, title").eq("production_id", productionId).limit(1).maybeSingle();
  if (!script) return <Empty msg="No script has been imported for this production yet. Once a script is in Spine, you can run lines here." />;

  const { data: lineRows } = await supabase
    .from("script_lines")
    .select("line_number, act, scene, line_type, character, content")
    .eq("script_id", script.id)
    .order("line_number", { ascending: true })
    .limit(6000);

  const lines = (lineRows || []) as Line[];
  if (lines.length === 0) return <Empty msg="This script doesn't have any lines yet." />;

  let suggested: string | null = null;
  if (personId) {
    const { data: asg } = await supabase
      .from("production_assignments").select("role_title")
      .eq("production_id", productionId).eq("person_id", personId).eq("active", true)
      .limit(1).maybeSingle();
    suggested = (asg?.role_title as string | null) ?? null;
  }

  return <RunLines scriptTitle={script.title || "Run Lines"} lines={lines} suggestedCharacter={suggested} />;
}
