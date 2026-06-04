import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole, orgIdForProduction } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";
import { RunLayout } from "./run-layout";

export default async function RunPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name")
    .eq("id", personId!).single();

  const activeProductionId = await getActiveProductionId();

  if (!activeProductionId) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md mb-2">Run</h1>
        <p className="text-body-md text-ash">No active production selected.</p>
      </div>
    );
  }

  const orgId = await orgIdForProduction(activeProductionId);
  const role = orgId ? await getRoleInOrg(person!.id, orgId) : null;
  const canManage = isLeadershipRole(role);

  const { data: production } = await supabase
    .from("productions")
    .select("id, title, status, org_id")
    .eq("id", activeProductionId)
    .single();

  if (!production) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md mb-2">Run</h1>
        <p className="text-body-md text-ash">Production not found.</p>
      </div>
    );
  }

  // Today's date in CT
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // Today's events + calls + responses
  const { data: todayEvents } = await supabase
    .from("schedule_events")
    .select(`
      id, title, event_type, event_date, start_time, end_time, location, notes,
      event_calls(
        id, person_id,
        people(id, full_name, preferred_name, phone)
      )
    `)
    .eq("production_id", activeProductionId)
    .eq("event_date", today)
    .order("start_time", { ascending: true });

  // Get responses for today's calls
  const todayCallIds = (todayEvents || []).flatMap(e =>
    (e.event_calls || []).map(c => c.id)
  );

  let todayResponses: Record<string, { status: string; conflict_reason: string | null }> = {};
  if (todayCallIds.length > 0 && orgId) {
    const { data: respData } = await supabase.rpc("get_all_call_responses_for_org", {
      p_org_id: orgId,
    });
    if (respData) {
      for (const r of respData as { event_call_id: string; status: string; conflict_reason: string | null }[]) {
        if (todayCallIds.includes(r.event_call_id)) {
          todayResponses[r.event_call_id] = { status: r.status, conflict_reason: r.conflict_reason };
        }
      }
    }
  }

  // Run sheet items
  const { data: runSheetItems } = await supabase
    .from("run_sheet_items")
    .select("*")
    .eq("production_id", activeProductionId)
    .order("sort_order", { ascending: true });

  // Recent reports
  const { data: reports } = await supabase
    .from("sm_reports")
    .select("*, people:completed_by(full_name, preferred_name)")
    .eq("production_id", activeProductionId)
    .order("report_date", { ascending: false })
    .limit(10);

  // Scenes for work log
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, act, scene_number, title")
    .eq("production_id", activeProductionId)
    .order("sort_order", { ascending: true });

  // Rehearsal work log
  const { data: workLog } = await supabase
    .from("rehearsal_work")
    .select("*, scenes(act, scene_number, title)")
    .eq("production_id", activeProductionId)
    .order("created_at", { ascending: false })
    .limit(20);

  // ── Tracking tab (scene breakdown, props, action items) ──
  const { data: trackingScenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("production_id", activeProductionId)
    .order("sort_order", { ascending: true });

  const { data: propsData } = await supabase
    .from("props")
    .select("*")
    .eq("production_id", activeProductionId);

  const { data: actionItemsData } = await supabase
    .from("action_items")
    .select("*")
    .eq("production_id", activeProductionId)
    .order("created_at", { ascending: false });

  const { data: castData } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people(id, full_name, preferred_name)")
    .eq("production_id", activeProductionId)
    .eq("department", "cast")
    .eq("active", true)
    .order("role_title", { ascending: true });
  const cast = (castData || []).filter(c => c.people).map(c => {
    const p = c.people as unknown as { id: string; full_name: string; preferred_name: string | null };
    return { person_id: p.id, name: p.preferred_name || p.full_name, role_title: c.role_title };
  });

  return (
    <RunLayout
      production={production}
      canManage={canManage}
      personId={person!.id}
      today={today}
      trackingScenes={(trackingScenes || []) as never[]}
      stageProps={(propsData || []) as never[]}
      actionItems={(actionItemsData || []) as never[]}
      cast={cast}
      todayEvents={(todayEvents || []).map(e => ({
        id: e.id,
        title: e.title,
        event_type: e.event_type,
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
        notes: e.notes,
        calls: (e.event_calls || []).map(c => {
          const p = c.people as unknown as { id: string; full_name: string; preferred_name: string | null; phone: string | null };
          const resp = todayResponses[c.id];
          return {
            id: c.id,
            person_id: p?.id || "",
            name: p?.preferred_name || p?.full_name || "Unknown",
            phone: p?.phone || null,
            status: resp?.status || null,
            conflict_reason: resp?.conflict_reason || null,
          };
        }),
      }))}
      runSheetItems={(runSheetItems || []).map(i => ({
        id: i.id, category: i.category, label: i.label,
        assigned_to: i.assigned_to, time_estimate: i.time_estimate,
        notes: i.notes, completed: i.completed, sort_order: i.sort_order,
      }))}
      reports={(reports || []).map(r => {
        const by = r.people as unknown as { full_name: string; preferred_name: string | null } | null;
        return {
          id: r.id, report_type: r.report_type, report_date: r.report_date,
          start_time: r.start_time, end_time: r.end_time,
          called: r.called, absent_late: r.absent_late,
          work_completed: r.work_completed, director_notes: r.director_notes,
          action_items: r.action_items, next_call: r.next_call,
          completed_by_name: by?.preferred_name || by?.full_name || null,
        };
      })}
      scenes={(scenes || []).map(s => ({
        id: s.id, act: s.act, scene_number: s.scene_number, title: s.title,
      }))}
      workLog={(workLog || []).map(w => {
        const sc = w.scenes as unknown as { act: number; scene_number: number; title: string | null } | null;
        return {
          id: w.id, work_type: w.work_type, run_count: w.run_count,
          notes: w.notes, created_at: w.created_at,
          scene_label: sc ? `Act ${sc.act}, Sc ${sc.scene_number}${sc.title ? `: ${sc.title}` : ""}` : null,
        };
      })}
    />
  );
}
