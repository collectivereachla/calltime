"use server";
import { assertNotPreviewing, getViewer } from "@/lib/viewer";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Writes go through the user client so the rider_sections RLS policy
// (owner/production roles only) is the single enforcement point.

export async function addRiderSection(data: {
  production_id: string;
  title: string;
  kind: "custom" | "auto";
  source?: "contacts" | "props" | "mics" | "scenery" | null;
  body?: string | null;
}) {
  await assertNotPreviewing();
  if (!data.title.trim()) return { error: "Section needs a title" };
  if (data.kind === "auto" && !data.source) return { error: "Auto section needs a source" };
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer.personId) return { error: "Not signed in" };

  const { data: maxRow } = await supabase
    .from("rider_sections")
    .select("sort_order")
    .eq("production_id", data.production_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("rider_sections").insert({
    production_id: data.production_id,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    title: data.title.trim(),
    kind: data.kind,
    source: data.kind === "auto" ? data.source : null,
    body: data.kind === "custom" ? (data.body || "") : null,
  });
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function updateRiderSection(data: { id: string; title: string; body: string | null }) {
  await assertNotPreviewing();
  if (!data.title.trim()) return { error: "Section needs a title" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("rider_sections")
    .update({ title: data.title.trim(), body: data.body, updated_at: new Date().toISOString() })
    .eq("id", data.id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function deleteRiderSection(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("rider_sections").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/booth");
  return { success: true };
}

export async function moveRiderSection(data: { production_id: string; id: string; direction: "up" | "down" }) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: sections, error } = await supabase
    .from("rider_sections")
    .select("id, sort_order")
    .eq("production_id", data.production_id)
    .order("sort_order");
  if (error) return { error: error.message };

  const list = sections || [];
  const idx = list.findIndex((s) => s.id === data.id);
  if (idx < 0) return { error: "Section not found" };
  const swapIdx = data.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { success: true };

  const a = list[idx];
  const b = list[swapIdx];
  const { error: e1 } = await supabase.from("rider_sections").update({ sort_order: b.sort_order }).eq("id", a.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.from("rider_sections").update({ sort_order: a.sort_order }).eq("id", b.id);
  if (e2) return { error: e2.message };
  revalidatePath("/booth");
  return { success: true };
}
