"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEventCallEmails } from "@/lib/email-triggers";
import { createNotification, notifyOrgOwners } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function createScheduleEvent(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const callEveryone = formData.get("call_everyone") === "on";
  const isMandatory = formData.get("mandatory") === "on";
  const personIds = formData.getAll("person_ids") as string[];
  const title = formData.get("title") as string;
  const eventDate = formData.get("event_date") as string;

  const { data: eventId, error } = await supabase.rpc("create_schedule_event", {
    p_production_id: productionId,
    p_event_type: formData.get("event_type") as string,
    p_title: title,
    p_event_date: eventDate,
    p_start_time: (formData.get("start_time") as string) || null,
    p_end_time: (formData.get("end_time") as string) || null,
    p_location: (formData.get("location") as string) || null,
    p_notes: (formData.get("notes") as string) || null,
    p_call_everyone: callEveryone,
  });

  if (error) return { error: error.message };

  // If not calling everyone and specific people were selected, set their calls
  if (!callEveryone && personIds.length > 0 && eventId) {
    const { error: callError } = await supabase.rpc("update_event_calls", {
      p_event_id: eventId,
      p_person_ids: personIds,
    });
    if (callError) return { error: callError.message };

    // Apply any per-person call times (staggered calls). Empty = event start.
    const callTimesRaw = formData.get("call_times") as string | null;
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

  // If mandatory, set the flag and auto-confirm all called people
  if (isMandatory && eventId) {
    await supabase.from("schedule_events").update({ mandatory: true }).eq("id", eventId);

    // Get all event_calls for this event and auto-confirm
    const { data: calls } = await supabase
      .from("event_calls")
      .select("id, person_id")
      .eq("event_id", eventId);

    if (calls && calls.length > 0) {
      const responses = calls
        .map((c) => ({
          event_call_id: c.id,
          status: "confirmed" as const,
          responded_at: new Date().toISOString(),
        }));

      await supabase.from("call_responses").upsert(responses, { onConflict: "event_call_id" });
    }
  }

  // New events are created as drafts (schedule_events.published defaults to
  // false), so creating one is silent — no calls or notifications go out until
  // the week is published. Publishing is what starts the confirm cycle.

  // Activity log
  if (eventId) {
    const dateStr = new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const { data: prod } = await supabase.from("productions").select("org_id").eq("id", productionId).single();
    if (prod) {
      logActivity({
        productionId, orgId: prod.org_id,
        action: "event_created", entityType: "schedule_event", entityId: eventId,
        summary: `Posted ${title} for ${dateStr}`,
      }).catch(() => {});
    }
  }

  revalidatePath("/callboard");
  return { success: true };
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
  const supabase = await createClient();

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

  // Only notify newly-called people if the event is already published. Calls
  // added while the week is still a draft stay silent until it's published.
  const { data: ev } = await supabase
    .from("schedule_events").select("published").eq("id", eventId).single();
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
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_calls")
    .insert({ event_id: eventId, person_id: personId });

  if (error) return { error: error.message };

  // Notify the person they've been added — but only if the event is published.
  const { data: event } = await supabase
    .from("schedule_events")
    .select("title, event_date, org_id, production_id, published")
    .eq("id", eventId)
    .single();

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
