import { createClient } from "@/lib/supabase/server";

interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  summary: string;
  created_at: string;
  actor_name: string | null;
  production_id: string | null;
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
  production_id: string | null;
  people: { preferred_name: string | null; full_name: string } | null;
};

const ACTIVITY_SELECT =
  "id, action, entity_type, entity_id, summary, created_at, actor_person_id, production_id, people:actor_person_id(preferred_name, full_name)";

export interface WhatChangedProduction {
  id: string;
  title: string;
  canManage: boolean;
}

export async function WhatChanged({
  productions,
  personId,
}: {
  productions: WhatChangedProduction[];
  personId: string;
}) {
  const supabase = await createClient();

  if (productions.length === 0) return null;

  const allIds = productions.map((p) => p.id);
  const manageIds = productions.filter((p) => p.canManage).map((p) => p.id);
  const personalOnlyIds = productions.filter((p) => !p.canManage).map((p) => p.id);
  const titleById = new Map(productions.map((p) => [p.id, p.title]));
  const showTag = productions.length > 1; // only worth tagging the show when there's more than one

  // The viewer's own owned entities, used to scope what cast-level members see.
  const [contractsRes, lineNotesRes, costumesRes, callsRes, appsRes] = await Promise.all([
    supabase.from("contracts").select("id").eq("person_id", personId),
    supabase.from("line_notes").select("id").eq("person_id", personId),
    supabase.from("costume_assignments").select("item_id").eq("person_id", personId),
    supabase.from("event_calls").select("event_id").eq("person_id", personId),
    supabase.from("applications").select("id").eq("person_id", personId),
  ]);
  const contractIds = new Set((contractsRes.data || []).map((r: { id: string }) => r.id));
  const lineNoteIds = new Set((lineNotesRes.data || []).map((r: { id: string }) => r.id));
  const costumeIds = new Set((costumesRes.data || []).map((r: { item_id: string }) => r.item_id));
  // Events this person is called to, and their own applications — so the scoped
  // feed surfaces "a rehearsal you're in changed" and "your application moved".
  const calledEventIds = new Set((callsRes.data || []).map((r: { event_id: string }) => r.event_id));
  const applicationIds = new Set((appsRes.data || []).map((r: { id: string }) => r.id));

  const byId = new Map<string, RawEntry>();

  // Productions the viewer leads: the full activity feed.
  if (manageIds.length > 0) {
    const { data } = await supabase
      .from("activity_log")
      .select(ACTIVITY_SELECT)
      .in("production_id", manageIds)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const e of (data || []) as unknown as RawEntry[]) byId.set(e.id, e);
  }

  // Productions where the viewer is cast/crew: only what pertains to them.
  if (personalOnlyIds.length > 0) {
    const { data } = await supabase
      .from("activity_log")
      .select(ACTIVITY_SELECT)
      .in("production_id", personalOnlyIds)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const e of (data || []) as unknown as RawEntry[]) {
      const keep =
        e.actor_person_id === personId ||
        (e.entity_id != null &&
          ((e.entity_type === "contract" && contractIds.has(e.entity_id)) ||
            (e.entity_type === "line_note" && lineNoteIds.has(e.entity_id)) ||
            (e.entity_type === "costume_inventory" && costumeIds.has(e.entity_id)) ||
            // schedule_event covers "a rehearsal you're in was added/changed" — but NOT
            // call_conflict, which carries another person's private reason (their own
            // conflicts still show via the actor check above).
            (e.entity_type === "schedule_event" && e.action !== "call_conflict" && calledEventIds.has(e.entity_id)) ||
            (e.entity_type === "application" && applicationIds.has(e.entity_id))));
      if (keep) byId.set(e.id, e);
    }
  }

  const feed: ActivityEntry[] = Array.from(byId.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((e) => ({
      id: e.id,
      action: e.action,
      entity_type: e.entity_type,
      summary: e.summary,
      created_at: e.created_at,
      actor_name: e.people?.preferred_name || e.people?.full_name || null,
      production_id: e.production_id,
    }));

  if (feed.length === 0) {
    return (
      <div className="bg-card border border-bone rounded-card p-5">
        <h3 className="font-display text-display-sm mb-2">What changed</h3>
        <p className="text-body-sm text-muted">No activity yet. Events, contracts, and notes will appear here as your productions move.</p>
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
              {group.items.map((entry) => {
                const title = entry.production_id ? titleById.get(entry.production_id) : null;
                return (
                  <div key={entry.id} className="flex items-start gap-3">
                    <span className="text-base mt-0.5 shrink-0 w-5 text-center">
                      {ACTION_ICONS[entry.action] || "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-ink leading-snug">{entry.summary}</p>
                      <p className="text-body-xs text-muted mt-0.5">
                        {showTag && title && (
                          <span className="text-brick">{title}</span>
                        )}
                        {showTag && title && " · "}
                        {timeAgo(entry.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
