import { createClient } from "@/lib/supabase/server";
import { NewEventForm } from "./new-event-form";
import { EventCard } from "./event-card";
import { EditEventButton } from "./edit-event";
import { CallboardTabs } from "./callboard-tabs";

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

export default async function CallboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  // Get user's org membership to check tier
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("person_id", person!.id)
    .limit(1)
    .single();

  const canManage =
    membership?.role === "owner" || membership?.role === "production";

  // Get productions user is assigned to
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("production_id, productions(id, title, status)")
    .eq("person_id", person!.id)
    .eq("active", true);

  const activeProductions =
    assignments
      ?.filter((a) => {
        const p = a.productions as unknown as { status: string };
        return p.status !== "archived" && p.status !== "closed";
      })
      .map((a) => a.productions as unknown as { id: string; title: string }) || [];

  // Get upcoming events for all user's productions
  // Use Central Time for "today" — UTC would hide today's events after 7PM CT
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const productionIds = activeProductions.map((p) => p.id);

  let events: {
    id: string;
    event_type: string;
    title: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    notes: string | null;
    production_id: string;
    productions: { title: string };
    event_calls: {
      id: string;
      person_id: string;
      people: { id: string; full_name: string; preferred_name: string | null };
      latest_response?: { status: string; conflict_reason: string | null } | null;
    }[];
  }[] = [];

  if (productionIds.length > 0) {
    const { data } = await supabase
      .from("schedule_events")
      .select(
        `
        id,
        event_type,
        title,
        event_date,
        start_time,
        end_time,
        location,
        notes,
        production_id,
        productions(title),
        event_calls(
          id,
          person_id,
          people(id, full_name, preferred_name)
        )
      `
      )
      .in("production_id", productionIds)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(30);

    events = (data as unknown as typeof events) || [];
  }

  // Get call responses for these events
  // Get call responses via RPC (bypasses RLS chain that was blocking reads)
  let responses: Record<string, { status: string; conflict_reason: string | null }> = {};

  if (membership?.org_id) {
    const { data: responseData } = await supabase.rpc("get_all_call_responses_for_org", {
      p_org_id: membership.org_id,
    });

    if (responseData) {
      for (const r of responseData as { event_call_id: string; status: string; conflict_reason: string | null }[]) {
        responses[r.event_call_id] = {
          status: r.status,
          conflict_reason: r.conflict_reason,
        };
      }
    }
  }

  // Get all company members for call management
  let companyMembers: { id: string; name: string; role: string; department: string }[] = [];
  if (canManage && productionIds.length > 0) {
    const { data: allAssignments } = await supabase
      .from("production_assignments")
      .select("person_id, role_title, department, people(id, full_name, preferred_name)")
      .in("production_id", productionIds)
      .eq("active", true);

    if (allAssignments) {
      const seen = new Set<string>();
      companyMembers = allAssignments
        .filter((a) => a.people != null)
        .map((a) => {
          const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null };
          if (seen.has(p.id)) return null;
          seen.add(p.id);
          return {
            id: p.id,
            name: p.preferred_name || p.full_name,
            role: a.role_title,
            department: a.department || "other",
          };
        })
        .filter(Boolean) as typeof companyMembers;
    }
  }

  // Group events by date
  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    if (!eventsByDate.has(event.event_date)) {
      eventsByDate.set(event.event_date, []);
    }
    eventsByDate.get(event.event_date)!.push(event);
  }

  // Fetch conflict responses for the Conflicts tab
  let conflicts: {
    event_id: string; event_title: string; event_type: string;
    event_date: string; start_time: string | null; production_title: string;
    person_name: string; person_id: string; conflict_reason: string | null;
    responded_at: string;
  }[] = [];

  if (canManage && membership?.org_id) {
    const { data: conflictData } = await supabase.rpc("get_conflict_responses", {
      p_org_id: membership.org_id,
    });
    conflicts = (conflictData as typeof conflicts) || [];
  }

  const typeColors: Record<string, string> = {
    rehearsal: "bg-ink/10 text-ink",
    tech: "bg-tentative/10 text-tentative",
    performance: "bg-brick/10 text-brick",
    meeting: "bg-ash/20 text-ash",
    fitting: "bg-confirmed/10 text-confirmed",
    photo_call: "bg-ink/10 text-ink",
    load_in: "bg-tentative/10 text-tentative",
    strike: "bg-brick/10 text-brick",
    other: "bg-ash/20 text-ash",
  };

  const statusColors: Record<string, string> = {
    confirmed: "text-confirmed",
    tentative: "text-tentative",
    conflict: "text-conflict",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-display-md text-ink">Callboard</h1>
          <p className="text-body-md text-ash mt-1">
            {events.length === 0
              ? "No upcoming events."
              : `${events.length} upcoming event${events.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <CallboardTabs
        canManage={canManage}
        conflicts={conflicts}
        scheduleContent={
          <>
            {/* New event form — owner and production only */}
            {canManage && activeProductions.length > 0 && (
              <div className="mb-8">
                <NewEventForm productions={activeProductions} />
              </div>
            )}

      {/* Events by date */}
      {events.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">
            {activeProductions.length === 0
              ? "You're not assigned to any active productions."
              : "No upcoming events scheduled."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(eventsByDate.entries()).map(([date, dayEvents]) => (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-mono text-data-md text-ink">
                  {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h2>
                <div className="flex-1 border-t border-bone" />
              </div>

              {/* Events for this date */}
              <div className="space-y-2">
                {dayEvents.map((event) => {
                  const prod = event.productions as unknown as { title: string };
                  const calls = (event.event_calls || []).filter(
                    (c) => c.people != null
                  );
                  const myCall = calls.find((c) => {
                    const p = c.people as unknown as { id: string };
                    return p.id === person!.id;
                  });
                  const myResponse = myCall ? responses[myCall.id] : null;

                  // Count responses
                  const confirmed = calls.filter(
                    (c) => responses[c.id]?.status === "confirmed"
                  ).length;
                  const total = calls.length;

                  return (
                    <div
                      key={event.id}
                      className="bg-card border border-bone rounded-card px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-body-xs font-medium px-1.5 py-0.5 rounded ${typeColors[event.event_type] || typeColors.other}`}
                            >
                              {event.event_type.replace(/_/g, " ")}
                            </span>
                            <span className="text-body-xs text-muted">
                              {prod.title}
                            </span>
                          </div>
                          <h3 className="text-body-md font-medium text-ink">
                            {event.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            {event.start_time && (
                              <span className="font-mono text-data-sm text-ash">
                                {formatTime(event.start_time)}
                                {event.end_time &&
                                  `–${formatTime(event.end_time)}`}
                              </span>
                            )}
                            {event.location && (
                              <span className="text-body-xs text-muted">
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.notes && (
                            <p className="text-body-xs text-ash mt-2">
                              {event.notes}
                            </p>
                          )}
                        </div>

                        {/* Response summary + Edit */}
                        <div className="text-right shrink-0 flex items-start gap-3">
                          {canManage && (
                            <EditEventButton
                              event={{
                                id: event.id,
                                event_type: event.event_type,
                                title: event.title,
                                event_date: event.event_date,
                                start_time: event.start_time,
                                end_time: event.end_time,
                                location: event.location,
                                notes: event.notes,
                              }}
                              calledPersonIds={calls.map((c) => {
                                const p = c.people as unknown as { id: string };
                                return p.id;
                              })}
                              companyMembers={companyMembers}
                            />
                          )}
                          {total > 0 && (
                            <div>
                              <span className="font-mono text-data-sm text-ash">
                                {confirmed}/{total}
                              </span>
                              <p className="text-body-xs text-muted">confirmed</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <EventCard
                        eventCallId={myCall?.id || null}
                        currentStatus={myResponse?.status || null}
                        currentPersonId={person!.id}
                        canManage={canManage}
                        calls={calls.map((call) => {
                          const p = call.people as unknown as {
                            id: string;
                            full_name: string;
                            preferred_name: string | null;
                          };
                          const resp = responses[call.id];
                          return {
                            id: call.id,
                            person_id: p.id,
                            person_name: p.preferred_name || p.full_name,
                            response_status: resp?.status || null,
                            conflict_reason: resp?.conflict_reason || null,
                          };
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
          </>
        }
      />
    </div>
  );
}
