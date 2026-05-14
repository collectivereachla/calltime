"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createScheduleEvent(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const productionId = formData.get("production_id") as string;
  const eventType = formData.get("event_type") as string;
  const title = formData.get("title") as string;
  const eventDate = formData.get("event_date") as string;
  const startTime = (formData.get("start_time") as string) || null;
  const endTime = (formData.get("end_time") as string) || null;
  const location = (formData.get("location") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const callEveryone = formData.get("call_everyone") === "on";

  // Get the org_id from the production (needed for denormalized FK)
  const { data: production } = await supabase
    .from("productions")
    .select("org_id")
    .eq("id", productionId)
    .single();

  if (!production) return { error: "Production not found" };

  const { data: event, error } = await supabase
    .from("schedule_events")
    .insert({
      production_id: productionId,
      org_id: production.org_id,
      event_type: eventType,
      title,
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      location,
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // If "call everyone" is checked, add all active production assignments
  if (callEveryone && event) {
    const { data: assignments } = await supabase
      .from("production_assignments")
      .select("person_id")
      .eq("production_id", productionId)
      .eq("active", true);

    if (assignments && assignments.length > 0) {
      const calls = assignments.map((a) => ({
        event_id: event.id,
        person_id: a.person_id,
      }));

      await supabase.from("event_calls").insert(calls);
    }
  }

  revalidatePath("/callboard");
  return { success: true, eventId: event.id };
}

export async function callPersonToEvent(eventId: string, personId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_calls")
    .insert({ event_id: eventId, person_id: personId });

  if (error) return { error: error.message };

  revalidatePath("/callboard");
  return { success: true };
}

export async function respondToCall(
  eventCallId: string,
  status: "confirmed" | "tentative" | "conflict",
  conflictReason?: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("call_responses").insert({
    event_call_id: eventCallId,
    status,
    conflict_reason: status === "conflict" ? conflictReason : null,
    responded_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/callboard");
  return { success: true };
}
