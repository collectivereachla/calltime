import { createClient } from "@/lib/supabase/server";

interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  summary: string;
  created_at: string;
  actor_name: string | null;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACTION_ICONS: Record<string, string> = {
  event_created: "📅",
  call_conflict: "⚠️",
  contract_signed: "✍️",
  contract_countersigned: "✅",
  annotation_added: "📝",
  application_accepted: "🎭",
  application_declined: "—",
  greenroom_message: "💬",
};

type RawEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
  actor_person_id: string | null;
  people: { preferred_name: string | null; full_name: string } | null;
};

const ACTIVITY_SELECT =
  "id, action, entity_type, entity_id, summary, created_at, actor_person_id, people:actor_person_id(preferred_name, full_name)";

export async function WhatChanged({
  productionId,
  personId,
  viewerCanManage,
}: {
  productionId: string;
  personId: string;
  viewerCanManage: boolean;
}) {
  const supabase = await createClient();

  let rawEntries: RawEntry[] = [];

  if (viewerCanManage) {
    // Production leadership sees the full activity feed.
    const { data } = await supabase
      .from("activity_log")
      .select(ACTIVITY_SELECT)
      .eq("production_id", productionId)
      .order("created_at", { ascending: false })
      .limit(20);
    rawEntries = (data || []) as unknown as RawEntry[];
  } else {
    // Everyone else sees only what pertains to them: things they did, plus
    // changes to their own contract, line notes addressed to them, and their
    // own costume assignments. Other people's contracts, conflicts, and notes
    // never appear.
    const [contractsRes, lineNotesRes, costumesRes, activityRes] = await Promise.all([
      supabase.from("contracts").select("id").eq("person_id", personId),
      supabase.from("line_notes").select("id").eq("person_id", personId),
      supabase.from("costume_inventory").select("id").eq("assigned_to_person_id", personId),
      supabase
        .from("activity_log")
        .select(ACTIVITY_SELECT)
        .eq("production_id", productionId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const contractIds = new Set((contractsRes.data || []).map((r: { id: string }) => r.id));
    const lineNoteIds = new Set((lineNotesRes.data || []).map((r: { id: string }) => r.id));
    const costumeIds = new Set((costumesRes.data || []).map((r: { id: string }) => r.id));

    rawEntries = ((activityRes.data || []) as unknown as RawEntry[])
      .filter((e) => {
        if (e.actor_person_id === personId) return true;
        if (e.entity_id == null) return false;
        if (e.entity_type === "contract") return contractIds.has(e.entity_id);
        if (e.entity_type === "line_note") return lineNoteIds.has(e.entity_id);
        if (e.entity_type === "costume_inventory") return costumeIds.has(e.entity_id);
        return false;
      })
      .slice(0, 20);
  }

  const feed: ActivityEntry[] = rawEntries.map((e) => ({
    id: e.id,
    action: e.action,
    entity_type: e.entity_type,
    summary: e.summary,
    created_at: e.created_at,
    actor_name: e.people?.preferred_name || e.people?.full_name || null,
  }));

  if (feed.length === 0) {
    return (
      <div className="bg-card border border-bone rounded-card p-5">
        <h3 className="font-display text-display-sm mb-2">What changed</h3>
        <p className="text-body-sm text-muted">No activity yet. Events, contracts, and notes will appear here as the production moves.</p>
      </div>
    );
  }

  // Group by day
  const grouped: { label: string; items: ActivityEntry[] }[] = [];
  let currentLabel = "";

  for (const entry of feed) {
    const d = new Date(entry.created_at);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const label = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

    if (label !== currentLabel) {
      grouped.push({ label, items: [] });
      currentLabel = label;
    }
    grouped[grouped.length - 1].items.push(entry);
  }

  return (
    <div className="bg-card border border-bone rounded-card p-5">
      <h3 className="font-display text-display-sm mb-4">What changed</h3>
      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.label}>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-2">{group.label}</p>
            <div className="space-y-2">
              {group.items.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3">
                  <span className="text-base mt-0.5 shrink-0 w-5 text-center">
                    {ACTION_ICONS[entry.action] || "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-ink leading-snug">{entry.summary}</p>
                    <p className="text-body-xs text-muted mt-0.5">{timeAgo(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
