"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function currentPersonId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();
  return person?.id ?? null;
}

// ---------------- Shots (coverage plan) ----------------

export async function saveVideoShot(data: {
  id?: string;
  production_id: string;
  title: string;
  description?: string | null;
  unit: string;
  scene_id?: string | null;
  shot_type?: string | null;
  priority: string;
  status?: string;
  notes?: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase
      .from("video_shots")
      .update({
        title: data.title,
        description: data.description || null,
        unit: data.unit,
        scene_id: data.scene_id || null,
        shot_type: data.shot_type || null,
        priority: data.priority,
        status: data.status || "planned",
        notes: data.notes || null,
      })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const person_id = await currentPersonId();
    const { error } = await supabase.from("video_shots").insert({
      production_id: data.production_id,
      title: data.title,
      description: data.description || null,
      unit: data.unit,
      scene_id: data.scene_id || null,
      shot_type: data.shot_type || null,
      priority: data.priority,
      status: data.status || "planned",
      notes: data.notes || null,
      created_by: person_id,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/booth");
  return { success: true };
}

export async function updateShotStatus(id: string, status: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("video_shots").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteVideoShot(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("video_shots").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

// ---------------- Deliverables ----------------

export async function saveVideoDeliverable(data: {
  id?: string;
  production_id: string;
  title: string;
  description?: string | null;
  kind: string;
  destination: string;
  status?: string;
  due_date?: string | null;
  assigned_to?: string | null;
  link_url?: string | null;
  notes?: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase
      .from("video_deliverables")
      .update({
        title: data.title,
        description: data.description || null,
        kind: data.kind,
        destination: data.destination,
        status: data.status || "not_started",
        due_date: data.due_date || null,
        assigned_to: data.assigned_to || null,
        link_url: data.link_url || null,
        notes: data.notes || null,
      })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const person_id = await currentPersonId();
    const { error } = await supabase.from("video_deliverables").insert({
      production_id: data.production_id,
      title: data.title,
      description: data.description || null,
      kind: data.kind,
      destination: data.destination,
      status: data.status || "not_started",
      due_date: data.due_date || null,
      assigned_to: data.assigned_to || null,
      link_url: data.link_url || null,
      notes: data.notes || null,
      created_by: person_id,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/booth");
  return { success: true };
}

export async function updateDeliverableStatus(id: string, status: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("video_deliverables").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteVideoDeliverable(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("video_deliverables").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

// ---------------- Releases (consent) ----------------

export async function saveVideoRelease(data: {
  id?: string;
  production_id: string;
  person_id?: string | null;
  subject_name: string;
  is_minor: boolean;
  guardian_name?: string | null;
  status?: string;
  signed_at?: string | null;
  notes?: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase
      .from("video_releases")
      .update({
        person_id: data.person_id || null,
        subject_name: data.subject_name,
        is_minor: data.is_minor,
        guardian_name: data.guardian_name || null,
        status: data.status || "needed",
        signed_at: data.signed_at || null,
        notes: data.notes || null,
      })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const person_id = await currentPersonId();
    const { error } = await supabase.from("video_releases").insert({
      production_id: data.production_id,
      person_id: data.person_id || null,
      subject_name: data.subject_name,
      is_minor: data.is_minor,
      guardian_name: data.guardian_name || null,
      status: data.status || "needed",
      signed_at: data.signed_at || null,
      notes: data.notes || null,
      created_by: person_id,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/booth");
  return { success: true };
}

export async function updateReleaseStatus(id: string, status: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const signed_at = status === "signed" ? new Date().toISOString().slice(0, 10) : null;
  const { error } = await supabase
    .from("video_releases")
    .update({ status, signed_at })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteVideoRelease(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("video_releases").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}
