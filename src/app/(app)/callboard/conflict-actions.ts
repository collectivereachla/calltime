"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export async function getMyConflicts() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  if (!person) return [];

  const { data } = await supabase
    .from("conflicts")
    .select("*")
    .eq("person_id", person.id)
    .order("start_date", { ascending: true });

  return data || [];
}

export async function submitConflict(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user.id).single();
  if (!person) return { error: "No person record" };

  const startDate = formData.get("start_date") as string;
  const endDate = (formData.get("end_date") as string) || null;
  const allDay = formData.get("all_day") !== "false";
  const startTime = allDay ? null : (formData.get("start_time") as string) || null;
  const endTime = allDay ? null : (formData.get("end_time") as string) || null;
  const conflictType = (formData.get("conflict_type") as string) || null;
  const description = (formData.get("description") as string) || null;

  if (!startDate) return { error: "Start date is required" };

  const { data: conflictId, error } = await supabase.rpc("save_conflict", {
    p_start_date: startDate,
    p_conflict_type: conflictType || "other",
    p_all_day: allDay,
    p_end_date: endDate,
    p_start_time: startTime,
    p_end_time: endTime,
    p_description: description,
  });

  if (error) return { error: error.message };

  // Activity log — find the person's productions for context
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("production_id, productions!inner(org_id)")
    .eq("person_id", person.id)
    .eq("active", true)
    .limit(1);

  if (assignments && assignments.length > 0) {
    const prod = assignments[0].productions as unknown as { org_id: string };
    const name = person.preferred_name || person.full_name.split(" ")[0];
    const dateStr = new Date(startDate + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const label = conflictType ? conflictType.replace("_", " ") : "conflict";

    logActivity({
      productionId: assignments[0].production_id,
      orgId: prod.org_id,
      actorPersonId: person.id,
      action: "conflict_submitted",
      entityType: "conflict",
      summary: `${name} submitted a ${label} for ${dateStr}${endDate ? " onwards" : ""}`,
    }).catch(() => {});
  }

  // Notify SM/owners
  if (assignments && assignments.length > 0) {
    const { createNotification } = await import("@/lib/notifications");
    const prod = assignments[0].productions as unknown as { org_id: string };
    const name = person.preferred_name || person.full_name.split(" ")[0];
    const dateStr = new Date(startDate + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });

    const { data: staff } = await supabase
      .from("org_memberships")
      .select("person_id")
      .eq("org_id", prod.org_id)
      .in("role", ["owner", "production"]);

    if (staff) {
      for (const s of staff) {
        if (s.person_id === person.id) continue;
        createNotification({
          personId: s.person_id,
          orgId: prod.org_id,
          type: "conflict_submitted",
          title: `${name} submitted a conflict`,
          body: `${dateStr}${description ? ": " + description : ""}`,
          link: "/callboard",
        }).catch(() => {});
      }
    }
  }

  revalidatePath("/settings");
  revalidatePath("/callboard");
  return { success: true };
}

export async function deleteConflict(conflictId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_conflict", {
    p_conflict_id: conflictId,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/callboard");
  return { success: true };
}

export async function getKnownConflictsForEvent(eventId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("check_known_conflicts", {
    p_event_id: eventId,
  });

  if (error) return [];
  return data || [];
}
