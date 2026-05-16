"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createScheduleEvent(formData: FormData) {
  const supabase = await createClient();

  const callEveryone = formData.get("call_everyone") === "on";
  const personIds = formData.getAll("person_ids") as string[];

  const { data: eventId, error } = await supabase.rpc("create_schedule_event", {
    p_production_id: formData.get("production_id") as string,
    p_event_type: formData.get("event_type") as string,
    p_title: formData.get("title") as string,
    p_event_date: formData.get("event_date") as string,
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

  revalidatePath("/callboard");
  return { success: true };
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

  revalidatePath("/callboard");
  return { success: true };
}
