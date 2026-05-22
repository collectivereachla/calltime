"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEventCallEmails } from "@/lib/email-triggers";
import { createNotification, notifyOrgOwners } from "@/lib/notifications";

export async function createScheduleEvent(formData: FormData) {
  const supabase = await createClient();

  const productionId = formData.get("production_id") as string;
  const callEveryone = formData.get("call_everyone") === "on";
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
  }

  // Send "you've been called" emails (fire-and-forget, errors logged internally)
  if (eventId) {
    sendEventCallEmails(eventId).catch(() => {});
  }

  // Push + in-app notifications to every called person
  if (eventId) {
    notifyCalledPeople(eventId, productionId, title, eventDate).catch(() => {});
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

  const { error } = await supabase.rpc("update_schedule_event", {
    p_event_id: formData.get("event_id") as string,
    p_event_type: formData.get("event_type") as string,
    p_title: formData.get("title") as string,
    p_event_date: formData.get("event_date") as string,
    p_start_time: (formData.get("start_time") as string) || null,
    p_end_time: (formData.get("end_time") as string) || null,
    p_location: (formData.get("location") as string) || null,
    p_notes: (formData.get("notes") as string) || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/callboard");
  return { success: true };
}

export async function deleteScheduleEvent(eventId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_schedule_event", {
    p_event_id: eventId,
  });

  if (error) return { error: error.message };

  revalidatePath("/callboard");
  return { success: true };
}

export async function updateEventCalls(
  eventId: string,
  personIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_event_calls", {
    p_event_id: eventId,
    p_person_ids: personIds,
  });

  if (error) return { error: error.message };

  // Send emails to newly-called people (only those without email_sent_at)
  sendEventCallEmails(eventId).catch(() => {});

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

  const { error } = await supabase
    .from("event_calls")
    .delete()
    .eq("id", eventCallId);

  if (error) return { error: error.message };

  revalidatePath("/callboard");
  return { success: true };
}

export async function addEventCall(eventId: string, personId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_calls")
    .insert({ event_id: eventId, person_id: personId });

  if (error) return { error: error.message };

  // Notify the person they've been added
  const { data: event } = await supabase
    .from("schedule_events")
    .select("title, event_date, org_id")
    .eq("id", eventId)
    .single();

  if (event) {
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
  }

  revalidatePath("/callboard");
  return { success: true };
}
