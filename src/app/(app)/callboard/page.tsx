import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";
import { getOrgTimezone } from "@/lib/timezone";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { NewEventForm } from "./new-event-form";
import { EventCard } from "./event-card";
import { EditEventButton } from "./edit-event";
import { CallboardTabs } from "./callboard-tabs";
import { PrintButton } from "./print-button";
import { PersonFilter } from "./person-filter";
import { PublishWeekButton } from "./publish-week-button";
import { getActiveProductionId } from "@/lib/active-production";

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

export default async function CallboardPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person: filterPersonId } = await searchParams;
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

  // Get user's org membership to check tier
  const actingOrgId = await resolveActingOrgId(person!.id);
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", person!.id)
    .eq("org_id", actingOrgId ?? "")
    .maybeSingle();

  const canManage =
    membership?.role === "owner" || membership?.role === "production";

  // Get active production from cookie
  const activeProductionId = await getActiveProductionId();

  // Get productions user is assigned to
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("production_id, productions(id, title, status)")
    .eq("person_id", person!.id)
    .eq("active", true);

  const allProductions =
    assignments
      ?.filter((a) => {
        const p = a.productions as unknown as { status: string };
        return p.status !== "archived" && p.status !== "closed";
      })
      .map((a) => a.productions as unknown as { id: string; title: string }) || [];

  // Filter to active production only
  const activeProductions = activeProductionId
    ? allProductions.filter(p => p.id === activeProductionId)
    : allProductions.slice(0, 1);

  // Get upcoming events for all user's productions
  // "today" in the org's timezone (defaults to Central) — UTC would hide today's events after 7PM
  const orgTz = await getOrgTimezone(actingOrgId);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: orgTz });
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
    published: boolean;
    productions: { title: string };
    event_calls: {
      id: string;
      person_id: string;
      call_time: string | null;
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
        mandatory,
        published,
        productions(title),
        event_calls(
          id,
          person_id,
          call_time,
          people!event_calls_person_id_fkey(id, full_name, preferred_name)
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
  const responses: Record<string, { status: string; conflict_reason: string | null }> = {};

  if (actingOrgId) {
    const { data: responseData } = await supabase.rpc("get_all_call_responses_for_org", {
      p_org_id: actingOrgId,
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

  // Fetch known conflicts for all production members (for conflict warnings)
  type KnownConflict = { person_id: string; start_date: string; end_date: string | null; all_day: boolean; start_time: string | null; end_time: string | null; conflict_type: string | null; description: string | null; };
  let knownConflicts: KnownConflict[] = [];
  if (productionIds.length > 0) {
    const personIds = events.flatMap(e => (e.event_calls || []).map(c => {
      const p = c.people as unknown as { id: string } | null;
      return p?.id;
    }).filter(Boolean)) as string[];
    const uniquePersonIds = [...new Set(personIds)];

    if (uniquePersonIds.length > 0) {
      const { data: conflictData } = await supabase
        .from("conflicts")
        .select("person_id, start_date, end_date, all_day, start_time, end_time, conflict_type, description")
        .in("person_id", uniquePersonIds.slice(0, 100));
      knownConflicts = (conflictData || []) as KnownConflict[];
    }
  }

  // Helper: check if a person has a known conflict for a specific event date/time
  function getConflictsForEvent(eventDate: string, startTime: string | null, calls: { person_id: string; person_name: string }[]) {
    const warnings: { person_name: string; conflict_type: string | null; description: string | null }[] = [];
    for (const call of calls) {
      for (const c of knownConflicts) {
        if (c.person_id !== call.person_id) continue;
        if (eventDate < c.start_date) continue;
        if (c.end_date && eventDate > c.end_date) continue;
        if (!c.end_date && eventDate !== c.start_date) continue;
        // Time overlap check
        if (!c.all_day && startTime && c.start_time) {
          const evStart = startTime;
          const cEnd = c.end_time || "23:59";
          const cStart = c.start_time;
          if (evStart >= cEnd || (cStart && evStart < cStart)) continue;
        }
        warnings.push({ person_name: call.person_name, conflict_type: c.conflict_type, description: c.description });
        break;
      }
    }
    return warnings;
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

  // Person -> role/department for everyone assigned to the active production(s).
  // Unlike companyMembers (leadership-only), this is needed by every viewer so a
  // person not on a call can still see who IS called, grouped by department.
  const assignmentByPerson = new Map<string, { role: string; department: string }>();
  if (productionIds.length > 0) {
    const { data: roleRows } = await supabase
      .from("production_assignments")
      .select("person_id, role_title, department")
      .in("production_id", productionIds)
      .eq("active", true);
    for (const r of roleRows || []) {
      if (!assignmentByPerson.has(r.person_id)) {
        assignmentByPerson.set(r.person_id, { role: r.role_title, department: r.department || "other" });
      }
    }
  }

  // Filter events by person if filter is active
  const displayEvents = filterPersonId
    ? events.filter((e) => {
        const calls = e.event_calls as unknown as { person_id: string; people: unknown }[] || [];
        return calls.some((c) => {
          const p = c.people as unknown as { id: string } | null;
          return p?.id === filterPersonId;
        });
      })
    : events;

  // Group events by date
  const eventsByDate = new Map<string, typeof events>();
  for (const event of displayEvents) {
    if (!eventsByDate.has(event.event_date)) {
      eventsByDate.set(event.event_date, []);
    }
    eventsByDate.get(event.event_date)!.push(event);
  }

  // Draft calls grouped by week (Mon), for the per-week Publish banner.
  function weekMonday(dateISO: string) {
    const d = new Date(dateISO + "T00:00:00Z");
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  const draftWeeks = new Map<string, number>();
  if (canManage) {
    for (const event of events) {
      if (!event.published) {
        const wk = weekMonday(event.event_date);
        draftWeeks.set(wk, (draftWeeks.get(wk) || 0) + 1);
      }
    }
  }
  const draftWeekList = Array.from(draftWeeks.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const publishProductionId = activeProductions[0]?.id || "";

  // Fetch conflict responses for the Conflicts tab
  let conflicts: {
    event_id: string; event_title: string; event_type: string;
    event_date: string; start_time: string | null; production_title: string;
    person_name: string; person_id: string; conflict_reason: string | null;
    responded_at: string;
  }[] = [];

  if (canManage && actingOrgId) {
    const { data: conflictData } = await supabase.rpc("get_conflict_responses", {
      p_org_id: actingOrgId,
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

  // Filter name for display
  const filterPerson = filterPersonId
    ? companyMembers.find((m) => m.id === filterPersonId)
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="font-display text-display-md text-ink">Callboard</h1>
          <p className="text-body-md text-ash mt-1">
            {displayEvents.length === 0
              ? filterPerson ? `No upcoming calls for ${filterPerson.name}.` : "No upcoming events."
              : `${displayEvents.length} upcoming event${displayEvents.length === 1 ? "" : "s"}${filterPerson ? ` for ${filterPerson.name}` : ""}`}
          </p>
        </div>
        {events.length > 0 && <PrintButton />}
      </div>

      {canManage && (
        <div className="mb-6 print:hidden">
          <Link
            href="/callboard/kiosk"
            className="inline-flex items-center gap-2 px-4 py-2 text-body-sm font-medium rounded-card bg-brick text-paper hover:bg-brick/90 transition-colors"
          >
            Open Check-In Kiosk
          </Link>
          <span className="ml-3 text-body-xs text-muted">Run this on the stage manager&rsquo;s device at the door.</span>
        </div>
      )}

      {/* Person filter */}
      {canManage && companyMembers.length > 0 && (
        <div className="mb-6 print:hidden">
          <PersonFilter members={companyMembers} />
        </div>
      )}

      <CallboardTabs
        canManage={canManage}
        conflicts={conflicts}
        scheduleContent={
          <>
            {/* New event form — owner and production only */}
            {canManage && activeProductions.length > 0 && (
              <div className="mb-8 print:hidden">
                <NewEventForm productions={activeProductions} companyMembers={companyMembers} />
              </div>
            )}

      {/* Draft calls awaiting publish (leadership only) */}
      {canManage && draftWeekList.length > 0 && publishProductionId && (
        <div className="mb-6 bg-bone/40 border border-bone rounded-card px-5 py-4 print:hidden">
          <h2 className="text-body-md font-medium text-ink mb-1">Draft Calls</h2>
          <p className="text-body-xs text-muted mb-3">
            These calls are saved but not yet sent. Publishing a week sends the calls and asks everyone to confirm.
          </p>
          <div className="space-y-2">
            {draftWeekList.map(([wk, count]) => {
              const end = new Date(wk + "T00:00:00Z");
              end.setUTCDate(end.getUTCDate() + 6);
              const label = `${new Date(wk + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}–${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
              return (
                <div key={wk} className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-ink">Week of {label}</span>
                  <PublishWeekButton productionId={publishProductionId} weekStart={wk} count={count} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events by date */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <span className="text-3xl mb-3 opacity-40">📋</span>
          <h3 className="font-display text-display-sm text-ink mb-2">
            {activeProductions.length === 0 ? "No active productions" : "No calls posted yet"}
          </h3>
          <p className="text-body-sm text-ash max-w-md leading-relaxed">
            {activeProductions.length === 0
              ? "You're not assigned to any active productions. If you were invited, check your email for login instructions."
              : canManage
              ? "Create your first event to start building the rehearsal schedule. Your company will be notified when they're called."
              : "Your stage manager hasn't posted a schedule yet. When calls go up, you'll see them here and get notified."}
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
                            {canManage && !event.published && (
                              <span className="text-body-xs font-medium px-1.5 py-0.5 rounded bg-bone text-ash">
                                Draft
                              </span>
                            )}
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
                          {myCall?.call_time && myCall.call_time !== event.start_time && (
                            <p className="mt-1 inline-flex items-center gap-1.5 text-body-xs font-medium text-brick">
                              <span className="font-mono text-data-sm">{formatTime(myCall.call_time)}</span>
                              your call time
                            </p>
                          )}
                          {event.notes && (
                            <p className="text-body-xs text-ash mt-2">
                              {event.notes}
                            </p>
                          )}
                        </div>

                        {/* Response summary + Edit */}
                        <div className="text-right shrink-0 flex items-start gap-3">
                          {canManage && (
                            <span className="print:hidden">
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
                              callTimes={Object.fromEntries(
                                calls.map((c) => {
                                  const p = c.people as unknown as { id: string };
                                  return [p.id, c.call_time];
                                })
                              )}
                              companyMembers={companyMembers}
                            />
                            </span>
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
                        eventId={event.id}
                        eventCallId={myCall?.id || null}
                        currentStatus={myResponse?.status || null}
                        currentPersonId={person!.id}
                        canManage={canManage}
                        eventStartTime={event.start_time}
                        mandatory={(event as unknown as { mandatory: boolean }).mandatory}
                        companyMembers={companyMembers.map((m) => ({ id: m.id, name: m.name }))}
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
                            call_time: call.call_time,
                            response_status: resp?.status || null,
                            conflict_reason: resp?.conflict_reason || null,
                            department: assignmentByPerson.get(p.id)?.department || "other",
                            role: assignmentByPerson.get(p.id)?.role || null,
                          };
                        })}
                      />

                      {/* Known conflict warnings */}
                      {(() => {
                        const callsForCheck = calls.map(c => {
                          const p = c.people as unknown as { id: string; full_name: string; preferred_name: string | null };
                          return { person_id: p.id, person_name: p.preferred_name || p.full_name };
                        });
                        const warnings = getConflictsForEvent(event.event_date, event.start_time, callsForCheck);
                        if (warnings.length === 0) return null;
                        return (
                          <div className="mt-3 px-3 py-2 bg-tentative/5 border border-tentative/20 rounded-card print:hidden">
                            <p className="text-body-xs font-medium text-tentative mb-1">⚠ Known conflicts</p>
                            {warnings.map((w, i) => (
                              <p key={i} className="text-body-xs text-ash">
                                <span className="font-medium text-ink">{w.person_name}</span>
                                {w.conflict_type && ` — ${w.conflict_type.replace("_", " ")}`}
                                {w.description && `: ${w.description}`}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
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
