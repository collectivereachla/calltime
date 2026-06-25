"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEventCallEmails } from "@/lib/email-triggers";
import { createNotification, notifyOrgOwners } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function createScheduleEvent(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const callEveryone = formData.get("call_everyone") === "on";
  const isMandatory = formData.get("mandatory") === "on";
  const personIds = formData.getAll("person_ids") as string[];
  const title = formData.get("title") as string;
  const eventDate = formData.get("event_date") as string;
  const eventType = formData.get("event_type") as string;
  const startTime = (formData.get("start_time") as string) || null;
  const endTime = (formData.get("end_time") as string) || null;
  const location = (formData.get("location") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const callTimesRaw = formData.get("call_times") as string | null;

  // Optional weekly recurrence: repeat on the selected weekdays through an end
  // date. New events are created as drafts (published defaults to false), so
  // bulk-creating a whole series is silent — nothing is called or notified until
  // the week is published.
  const repeatUntil = (formData.get("repeat_until") as string) || "";
  const repeatDays = (formData.getAll("repeat_days") as string[])
    .map((d) => parseInt(d, 10))
    .filter((d) => !Number.isNaN(d));
  const dates = buildRecurringDates(eventDate, repeatUntil, repeatDays);

  // Apply calls, staggered call times, and mandatory auto-confirm to one event.
  async function configureEvent(eventId: string): Promise<string | null> {
    if (!callEveryone && personIds.length > 0) {
      const { error: callError } = await supabase.rpc("update_event_calls", {
        p_event_id: eventId,
        p_person_ids: personIds,
      });
      if (callError) return callError.message;

      if (callTimesRaw) {
        try {
          const times = JSON.parse(callTimesRaw);
          if (Array.isArray(times) && times.length > 0) {
            await supabase.rpc("set_event_call_times", { p_event_id: eventId, p_times: times });
          }
        } catch {
          // malformed times payload — ignore, calls still created at event start
        }
      }
    }

    if (isMandatory) {
      await supabase.from("schedule_events").update({ mandatory: true }).eq("id", eventId);
      const { data: calls } = await supabase
        .from("event_calls")
        .select("id, person_id")
        .eq("event_id", eventId);
      if (calls && calls.length > 0) {
        const responses = calls.map((c) => ({
          event_call_id: c.id,
          status: "confirmed" as const,
          responded_at: new Date().toISOString(),
        }));
        await supabase.from("call_responses").upsert(responses, { onConflict: "event_call_id" });
      }
    }
    return null;
  }

  let firstEventId: string | null = null;
  let created = 0;
  for (const d of dates) {
    const { data: eventId, error } = await supabase.rpc("create_schedule_event", {
      p_production_id: productionId,
      p_event_type: eventType,
      p_title: title,
      p_event_date: d,
      p_start_time: startTime,
      p_end_time: endTime,
      p_location: location,
      p_notes: notes,
      p_call_everyone: callEveryone,
    });
    if (error) {
      if (created === 0) return { error: error.message };
      break; // keep the events that already succeeded
    }
    if (eventId) {
      if (!firstEventId) firstEventId = eventId as string;
      const cfgErr = await configureEvent(eventId as string);
      if (cfgErr && created === 0) return { error: cfgErr };
      created++;
    }
  }

  // Activity log
  if (firstEventId) {
    const dateStr = new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const { data: prod } = await supabase.from("productions").select("org_id").eq("id", productionId).single();
    if (prod) {
      logActivity({
        productionId, orgId: prod.org_id,
        action: "event_created", entityType: "schedule_event", entityId: firstEventId,
        summary: created > 1 ? `Posted ${created} ${title} events starting ${dateStr}` : `Posted ${title} for ${dateStr}`,
      }).catch(() => {});
    }
  }

  revalidatePath("/callboard");
  return { success: true, count: created };
}

// Build the list of dates for a (possibly recurring) event. Always includes the
// base date. With an end date + weekdays, adds every matching weekday from the
// base date through the end date (inclusive). Capped at one year to be safe.
function buildRecurringDates(baseDate: string, repeatUntil: string, weekdays: number[]): string[] {
  if (!baseDate) return [];
  if (!repeatUntil || weekdays.length === 0) return [baseDate];
  const start = new Date(baseDate + "T00:00:00");
  const end = new Date(repeatUntil + "T00:00:00");
  if (Number.isNaN(end.getTime()) || end < start) return [baseDate];
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const set = new Set<string>([baseDate]);
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 366) {
    if (weekdays.includes(cur.getDay())) set.add(fmt(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return Array.from(set).sort();
}

/** Notify each person called to an event */
async function notifyCalledPeople(
  eventId: string,
  productionId: string,
  title: string,
  eventDate: string
) {
  const supabase = await createClient();
  const dateStr = new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const { data: production } = await supabase
    .from("productions")
    .select("org_id")
    .eq("id", productionId)
    .single();
  if (!production) return;

  const { data: calls } = await supabase
    .from("event_calls")
    .select("person_id")
    .eq("event_id", eventId);
  if (!calls || calls.length === 0) return;

  for (const call of calls) {
    createNotification({
      personId: call.person_id,
      orgId: production.org_id,
      type: "event_call",
      title: `You've been called`,
      body: `${title} — ${dateStr}`,
      link: "/callboard",
    }).catch(() => {});
  }
}

export async function updateScheduleEvent(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const eventId = formData.get("event_id") as string;

  // Snapshot the event + its calls before the update so we can detect what changed.
  const { data: before } = await supabase
    .from("schedule_events")
    .select("event_date, start_time, end_time, location, title, event_type, published, org_id, production_id, ics_sequence, productions(title), organizations(name), event_calls(id, person_id)")
    .eq("id", eventId)
    .single();

  const { error } = await supabase.rpc("update_schedule_event", {
    p_event_id: eventId,
    p_event_type: formData.get("event_type") as string,
    p_title: formData.get("title") as string,
    p_event_date: formData.get("event_date") as string,
    p_start_time: (formData.get("start_time") as string) || null,
    p_end_time: (formData.get("end_time") as string) || null,
    p_location: (formData.get("location") as string) || null,
    p_notes: (formData.get("notes") as string) || null,
  });

  if (error) return { error: error.message };

  // Notify called people if this was a published event and something material changed.
  if (before?.published) {
    const newDate = formData.get("event_date") as string;
    const newStart = (formData.get("start_time") as string) || null;
    const newEnd = (formData.get("end_time") as string) || null;
    const newLocation = (formData.get("location") as string) || null;
    const newTitle = formData.get("title") as string;

    const moved =
      before.event_date !== newDate ||
      (before.start_time || null) !== newStart ||
      (before.end_time || null) !== newEnd;
    const detailChanged =
      (before.location || null) !== newLocation || before.title !== newTitle;

    if (moved || detailChanged) {
      const calls = (before.event_calls as unknown as { id: string; person_id: string }[]) || [];
      // Bump the calendar sequence on a real move so emailed invites update in place.
      let newSeq = (before.ics_sequence as number) ?? 0;
      if (moved) {
        newSeq = newSeq + 1;
        await supabase.from("schedule_events").update({ ics_sequence: newSeq }).eq("id", eventId);
      }
      const prod = before.productions as unknown as { title: string } | null;
      const org = before.organizations as unknown as { name: string } | null;
      const { notifyScheduleChange } = await import("@/lib/schedule-change");
      notifyScheduleChange({
        orgId: before.org_id,
        productionId: before.production_id,
        eventId,
        title: newTitle || before.title,
        published: true,
        kind: moved ? "moved" : "updated",
        oldDate: before.event_date,
        oldStart: before.start_time,
        newDate,
        newStart,
        newLocation,
        personIds: calls.map((c) => c.person_id),
        eventCallIds: calls.map((c) => c.id),
        productionTitle: prod?.title ?? null,
        orgName: org?.name ?? null,
        eventType: (formData.get("event_type") as string) || before.event_type,
        newEnd,
        icsSequence: newSeq,
      }).catch(() => {});
    }
  }

  revalidatePath("/callboard");
  return { success: true };
}

export async function deleteScheduleEvent(eventId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();

  // Snapshot before deletion so we can notify confirmed/called people.
  const { data: before } = await supabase
    .from("schedule_events")
    .select("event_date, start_time, title, event_type, published, org_id, production_id, ics_sequence, productions(title), organizations(name), event_calls(person_id)")
    .eq("id", eventId)
    .single();

  const { error } = await supabase.rpc("delete_schedule_event", {
    p_event_id: eventId,
  });

  if (error) return { error: error.message };

  if (before?.published) {
    const calls = (before.event_calls as unknown as { person_id: string }[]) || [];
    if (calls.length > 0) {
      const prod = before.productions as unknown as { title: string } | null;
      const org = before.organizations as unknown as { name: string } | null;
      const { notifyScheduleChange } = await import("@/lib/schedule-change");
      notifyScheduleChange({
        orgId: before.org_id,
        productionId: before.production_id,
        eventId,
        title: before.title,
        published: true,
        kind: "canceled",
        oldDate: before.event_date,
        oldStart: before.start_time,
        newDate: before.event_date,
        newStart: before.start_time,
        personIds: calls.map((c) => c.person_id),
        productionTitle: prod?.title ?? null,
        orgName: org?.name ?? null,
        eventType: before.event_type,
        icsSequence: ((before.ics_sequence as number) ?? 0) + 1,
      }).catch(() => {});
    }
  }

  revalidatePath("/callboard");
  return { success: true };
}

export async function updateEventCalls(
  eventId: string,
  personIds: string[],
  times?: { person_id: string; call_time: string | null }[]
): Promise<{ success?: boolean; error?: string }> {
  await assertNotPreviewing();
  const supabase = await createClient();

  // Snapshot who was called before AND their current call times, so we can
  // tell genuine additions from existing calls, and detect time changes for
  // people who stay on the call.
  const { data: beforeCalls } = await supabase
    .from("event_calls")
    .select("id, person_id, call_time")
    .eq("event_id", eventId);
  const beforeIds = new Set((beforeCalls || []).map((c) => c.person_id as string));
  const beforeTimeByPerson = new Map<string, string | null>(
    (beforeCalls || []).map((c) => [c.person_id as string, (c.call_time as string | null) ?? null])
  );
  const addedIds = personIds.filter((id) => !beforeIds.has(id));

  const { error } = await supabase.rpc("update_event_calls", {
    p_event_id: eventId,
    p_person_ids: personIds,
  });

  if (error) return { error: error.message };

  // Apply per-person call times (staggered calls). Only the listed people are
  // touched; an empty/null call_time clears a person back to the event start.
  if (times && times.length > 0) {
    const { error: tErr } = await supabase.rpc("set_event_call_times", {
      p_event_id: eventId,
      p_times: times,
    });
    if (tErr) return { error: tErr.message };
  }

  // Only notify on a published event. Calls added while the week is still a
  // draft stay silent until it's published (publishWeek sends them then).
  const { data: ev } = await supabase
    .from("schedule_events")
    .select("title, event_date, start_time, end_time, location, event_type, ics_sequence, org_id, production_id, published, productions(title), organizations(name)")
    .eq("id", eventId)
    .single();

  if (ev?.published && addedIds.length > 0) {
    // Fetch the fresh event_call rows for the people we just added, so we can
    // force them back to pending: any prior confirmation is void because they
    // were off this call and are now being asked again.
    const { data: addedCalls } = await supabase
      .from("event_calls")
      .select("id, person_id")
      .eq("event_id", eventId)
      .in("person_id", addedIds);

    const addedCallIds = (addedCalls || []).map((c) => c.id as string);
    if (addedCallIds.length > 0) {
      // Clear any lingering responses and reset nudge tracking so they must
      // confirm again. email_sent_at stays null so sendEventCallEmails picks
      // them up below.
      await supabase.from("call_responses").delete().in("event_call_id", addedCallIds);
      await supabase
        .from("event_calls")
        .update({ nudge_sent_at: null })
        .in("id", addedCallIds);
    }

    // In-app + push for every newly-called person (the email goes out via
    // sendEventCallEmails). This is the ping that was missing on re-add.
    const dateStr = new Date(ev.event_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    for (const pid of addedIds) {
      createNotification({
        personId: pid,
        orgId: ev.org_id,
        type: "event_call",
        title: "You've been called",
        body: `${ev.title} — ${dateStr}`,
        link: "/callboard",
      }).catch(() => {});
    }

    const { logScheduleChanges } = await import("@/lib/schedule-change");
    logScheduleChanges(
      addedIds.map((pid) => ({
        orgId: ev.org_id, productionId: ev.production_id, personId: pid,
        eventId, changeType: "called" as const,
        summary: `Added to ${ev.title} on ${dateStr}`, eventDate: ev.event_date,
      }))
    ).catch(() => {});
  }

  // Per-person call-time changes: anyone who stays on the call but whose
  // individual time moved must be told, exactly like an event move. We compare
  // the submitted times against the snapshot and notify only real changes,
  // skipping people we already handled as fresh adds above.
  if (ev?.published && times && times.length > 0) {
    const addedSet = new Set(addedIds);
    const norm = (t: string | null) => (t && t.length >= 5 ? t.slice(0, 5) : t || null);
    const timeChanged = times.filter((t) => {
      if (addedSet.has(t.person_id)) return false;
      if (!beforeIds.has(t.person_id)) return false;
      return norm(beforeTimeByPerson.get(t.person_id) ?? null) !== norm(t.call_time);
    });

    if (timeChanged.length > 0) {
      const changedPersonIds = timeChanged.map((t) => t.person_id);
      const { data: changedCalls } = await supabase
        .from("event_calls")
        .select("id, person_id")
        .eq("event_id", eventId)
        .in("person_id", changedPersonIds);
      const changedCallIds = (changedCalls || []).map((c) => c.id as string);

      const prod = ev.productions as unknown as { title: string } | null;
      const org = ev.organizations as unknown as { name: string } | null;
      const { notifyScheduleChange } = await import("@/lib/schedule-change");
      // Treat each changed person's new call time as the event's "new start"
      // for their notification. notifyScheduleChange re-opens their confirmation
      // and sends push + email within 48h, digest otherwise.
      for (const t of timeChanged) {
        const call = (changedCalls || []).find((c) => c.person_id === t.person_id);
        notifyScheduleChange({
          orgId: ev.org_id,
          productionId: ev.production_id,
          eventId,
          title: ev.title,
          published: true,
          kind: "moved",
          oldDate: ev.event_date,
          oldStart: beforeTimeByPerson.get(t.person_id) ?? ev.start_time,
          newDate: ev.event_date,
          newStart: t.call_time || ev.start_time,
          newLocation: ev.location,
          personIds: [t.person_id],
          eventCallIds: call ? [call.id as string] : [],
          productionTitle: prod?.title ?? null,
          orgName: org?.name ?? null,
          eventType: ev.event_type,
          newEnd: ev.end_time,
          icsSequence: (ev.ics_sequence as number) ?? 0,
        }).catch(() => {});
      }
      void changedCallIds;
    }
  }

  if (ev?.published) {
    sendEventCallEmails(eventId).catch(() => {});
  }

  revalidatePath("/callboard");
  return { success: true };
}

export async function respondToCall(
  eventCallId: string,
  status: "confirmed" | "tentative" | "conflict",
  conflictReason?: string
) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { error } = await supabase.rpc("respond_to_call", {
    p_event_call_id: eventCallId,
    p_status: status,
    p_conflict_reason: conflictReason || null,
  });

  if (error) return { error: error.message };

  // Notify SM/owners on conflict responses
  if (status === "conflict") {
    notifyOnConflict(eventCallId, conflictReason).catch(() => {});
  }

  // Activity log for conflicts
  if (status === "conflict") {
    logConflictActivity(eventCallId, conflictReason).catch(() => {});
  }

  revalidatePath("/callboard");
  return { success: true };
}

async function notifyOnConflict(eventCallId: string, reason?: string) {
  const supabase = await createClient();

  const { data: call } = await supabase
    .from("event_calls")
    .select(`
      person_id,
      people!inner(full_name, preferred_name),
      schedule_events!inner(id, title, event_date, production_id, org_id)
    `)
    .eq("id", eventCallId)
    .single();

  if (!call) return;

  const person = call.people as unknown as { full_name: string; preferred_name: string | null };
  const event = call.schedule_events as unknown as {
    title: string; event_date: string; production_id: string; org_id: string;
  };
  const name = person.preferred_name || person.full_name.split(" ")[0];

  // Notify all owner/production tier members
  const { data: staff } = await supabase
    .from("org_memberships")
    .select("person_id")
    .eq("org_id", event.org_id)
    .in("role", ["owner", "production"]);

  if (!staff) return;

  for (const s of staff) {
    if (s.person_id === call.person_id) continue; // don't notify self
    createNotification({
      personId: s.person_id,
      orgId: event.org_id,
      type: "call_conflict",
      title: `${name} has a conflict`,
      body: `${event.title}${reason ? ` — "${reason}"` : ""}`,
      link: "/callboard",
    }).catch(() => {});
  }
}

export async function removeEventCall(eventCallId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: call } = await supabase
    .from("event_calls").select("person_id, event_id").eq("id", eventCallId).single();

  // Latest response lives in call_responses (event_calls has no status column).
  let confirmed = false;
  if (call) {
    const { data: resp } = await supabase
      .from("call_responses").select("status").eq("event_call_id", eventCallId)
      .order("responded_at", { ascending: false }).limit(1).maybeSingle();
    confirmed = resp?.status === "confirmed";
  }

  type EvShape = { title: string; event_date: string; org_id: string; production_id: string; published: boolean };
  let event: EvShape | null = null;
  if (call) {
    const { data: ev } = await supabase
      .from("schedule_events")
      .select("title, event_date, org_id, production_id, published")
      .eq("id", call.event_id).single();
    event = (ev as unknown as EvShape) || null;
  }

  const { error } = await supabase.from("event_calls").delete().eq("id", eventCallId);
  if (error) return { error: error.message };

  if (call && event?.published) {
    const dateStr = new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    // Log for the weekly digest.
    const { logScheduleChanges } = await import("@/lib/schedule-change");
    logScheduleChanges([{
      orgId: event.org_id, productionId: event.production_id, personId: call.person_id,
      eventId: call.event_id, changeType: "uncalled",
      summary: `Removed from ${event.title} on ${dateStr}`, eventDate: event.event_date,
    }]).catch(() => {});
    // Real-time ping only if they'd already confirmed.
    if (confirmed) {
      createNotification({
        personId: call.person_id, orgId: event.org_id, type: "event_call",
        title: "You're no longer called", body: `${event.title} — ${dateStr}`, link: "/callboard",
      }).catch(() => {});
    }
  }

  revalidatePath("/callboard");
  return { success: true };
}

export async function addEventCall(eventId: string, personId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: inserted, error } = await supabase
    .from("event_calls")
    .insert({ event_id: eventId, person_id: personId })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Notify the person they've been added — but only if the event is published.
  const { data: event } = await supabase
    .from("schedule_events")
    .select("title, event_date, org_id, production_id, published, mandatory")
    .eq("id", eventId)
    .single();

  // Mandatory events auto-confirm everyone called. A person added after the
  // event was flagged mandatory must be auto-confirmed too, or they get stuck:
  // the UI shows a static "Confirmed" label with no button, while their actual
  // response stays empty. Write the confirmation here.
  if (event?.mandatory && inserted?.id) {
    const { data: pers } = await supabase
      .from("people").select("user_id").eq("id", personId).maybeSingle();
    if (pers?.user_id) {
      await supabase.from("call_responses").upsert(
        { event_call_id: inserted.id, status: "confirmed", responded_at: new Date().toISOString(), responded_by: pers.user_id },
        { onConflict: "event_call_id" }
      );
    }
  }

  if (event?.published) {
    const dateStr = new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    createNotification({
      personId,
      orgId: event.org_id,
      type: "event_call",
      title: `You've been called`,
      body: `${event.title} — ${dateStr}`,
      link: "/callboard",
    }).catch(() => {});
    const { logScheduleChanges } = await import("@/lib/schedule-change");
    logScheduleChanges([{
      orgId: event.org_id, productionId: event.production_id, personId,
      eventId, changeType: "called",
      summary: `Added to ${event.title} on ${dateStr}`, eventDate: event.event_date,
    }]).catch(() => {});
  }

  revalidatePath("/callboard");
  return { success: true };
}

async function logConflictActivity(eventCallId: string, reason?: string) {
  const supabase = await createClient();

  const { data: call } = await supabase
    .from("event_calls")
    .select("person_id, people!inner(full_name, preferred_name), schedule_events!inner(id, title, event_date, production_id, org_id)")
    .eq("id", eventCallId)
    .single();

  if (!call) return;

  const person = call.people as unknown as { full_name: string; preferred_name: string | null };
  const event = call.schedule_events as unknown as {
    id: string; title: string; production_id: string; org_id: string;
  };
  const name = person.preferred_name || person.full_name.split(" ")[0];

  logActivity({
    productionId: event.production_id,
    orgId: event.org_id,
    actorPersonId: call.person_id,
    action: "call_conflict",
    entityType: "schedule_event",
    entityId: event.id,
    summary: `${name} flagged a conflict with ${event.title}${reason ? ": " + reason : ""}`,
  }).catch(() => {});
}
// Publish all draft events in a given week (Mon–Sun) for a production. This is
// what makes calls live and starts the confirm cycle: it sends the call emails
// and the "you've been called" notifications for the newly published events.
export async function publishWeek(productionId: string, weekStartISO: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: prod } = await supabase
    .from("productions").select("org_id").eq("id", productionId).single();
  if (!prod) return { error: "Production not found." };

  const { data: mem } = await supabase
    .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", prod.org_id).maybeSingle();
  if (!mem || !["owner", "production"].includes(mem.role)) {
    return { error: "Only the production team can publish the schedule." };
  }

  const endD = new Date(weekStartISO + "T00:00:00Z");
  endD.setUTCDate(endD.getUTCDate() + 6);
  const weekEndISO = endD.toISOString().slice(0, 10);

  const { data: drafts } = await supabase
    .from("schedule_events")
    .select("id, title, event_date")
    .eq("production_id", productionId)
    .eq("published", false)
    .gte("event_date", weekStartISO)
    .lte("event_date", weekEndISO);

  if (!drafts || drafts.length === 0) return { error: null, published: 0 };

  const { error: upErr } = await supabase
    .from("schedule_events")
    .update({ published: true, published_at: new Date().toISOString() })
    .in("id", drafts.map((d) => d.id));
  if (upErr) return { error: upErr.message };

  for (const ev of drafts) {
    sendEventCallEmails(ev.id).catch(() => {});
    notifyCalledPeople(ev.id, productionId, ev.title, ev.event_date).catch(() => {});
  }

  revalidatePath("/callboard");
  return { error: null, published: drafts.length };
}
