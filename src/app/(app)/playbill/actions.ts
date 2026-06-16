"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotPreviewing } from "@/lib/viewer";
import { revalidatePath } from "next/cache";

async function requireLeadership(orgId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { ok: false as const, error: "No member profile." };
  const { data: mem } = await supabase
    .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", orgId).maybeSingle();
  if (!mem || !["owner", "production"].includes(mem.role as string)) {
    return { ok: false as const, error: "Only production leadership can edit the playbill." };
  }
  return { ok: true as const, meId: me.id };
}

// Get the playbill for a production, creating an empty one on first open.
export async function ensurePlaybill(productionId: string, orgId: string) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error, playbill: null };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("playbills").select("*").eq("production_id", productionId).maybeSingle();
  if (existing) return { error: null, playbill: existing };

  const { data: created, error } = await admin
    .from("playbills")
    .insert({ production_id: productionId, org_id: orgId })
    .select("*")
    .single();
  if (error) return { error: error.message, playbill: null };
  revalidatePath("/playbill");
  return { error: null, playbill: created };
}

type PlaybillFields = {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  dedication?: string | null;
  show_info?: string | null;
  directors_note?: string | null;
  song_scene_list?: unknown;
  special_thanks?: string | null;
  include_cast?: boolean;
  include_creative_team?: boolean;
  cover_image_path?: string | null;
};

export async function savePlaybill(playbillId: string, orgId: string, fields: PlaybillFields) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("playbills")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", playbillId);
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}

export async function addCredit(playbillId: string, orgId: string, credit: {
  credit_type: "sponsor" | "ad" | "acknowledgment" | "partner";
  name: string; detail?: string | null; link_url?: string | null; image_path?: string | null;
}) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };
  if (!credit.name?.trim()) return { error: "Name is required." };

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("playbill_credits").select("sort_order").eq("playbill_id", playbillId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await admin.from("playbill_credits").insert({
    playbill_id: playbillId,
    credit_type: credit.credit_type,
    name: credit.name.trim(),
    detail: credit.detail || null,
    link_url: credit.link_url || null,
    image_path: credit.image_path || null,
    sort_order: nextOrder,
  });
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}

export async function deleteCredit(creditId: string, orgId: string) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("playbill_credits").delete().eq("id", creditId);
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}
