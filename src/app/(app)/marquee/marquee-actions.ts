"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

const VALID_CATEGORIES = ["flyer", "photo", "headshot", "highlight", "other"];
const CATEGORY_LABEL: Record<string, string> = {
  flyer: "Flyers", photo: "Promotional Photos", headshot: "Headshots", highlight: "Company Highlights", other: "Other",
};

// Tag people on an asset and notify anyone newly tagged.
async function applyTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string,
  personIds: string[],
  notifyPersonIds: string[],
  context: { orgId: string; productionTitle: string; categoryLabel: string }
) {
  const clean = Array.from(new Set(personIds.filter(Boolean)));
  if (clean.length > 0) {
    await supabase
      .from("promo_asset_tags")
      .insert(clean.map((pid) => ({ asset_id: assetId, person_id: pid })))
      .select("asset_id");
  }
  for (const pid of notifyPersonIds) {
    createNotification({
      personId: pid,
      orgId: context.orgId,
      type: "promo_tag",
      title: "You were tagged in Marquee",
      body: `${context.categoryLabel}${context.productionTitle ? ` · ${context.productionTitle}` : ""}`,
      link: "/marquee",
    }).catch(() => {});
  }
}

// Production leadership = org owner/production/admin, or a designer / stage
// manager / director / production-tier assignment on this show. Shared by the
// auto-approve-on-upload rule and the manual promote/demote action.
async function isProductionLeadership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  productionId: string,
  orgId: string
) {
  const { data: mem } = await supabase
    .from("org_memberships").select("role").eq("person_id", personId).eq("org_id", orgId).maybeSingle();
  if (mem && ["owner", "production", "admin"].includes(mem.role)) return true;
  const { data: pa } = await supabase
    .from("production_assignments")
    .select("access_tier, department")
    .eq("person_id", personId)
    .eq("production_id", productionId)
    .eq("active", true);
  return (pa || []).some(
    (a) =>
      ["admin", "production", "staff"].includes(a.access_tier) ||
      ["design", "stage_management", "direction"].includes(a.department)
  );
}

// Promote a company upload into Approved (or move it back). Leadership only.
export async function setPromoOfficial(id: string, isOfficial: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: asset } = await supabase
    .from("promo_assets").select("id, production_id, org_id").eq("id", id).single();
  if (!asset) return { error: "File not found." };

  const allowed = await isProductionLeadership(supabase, me.id, asset.production_id, asset.org_id);
  if (!allowed) return { error: "Only the production team can approve materials." };

  const { error } = await supabase.from("promo_assets").update({ is_official: isOfficial }).eq("id", id).select("id");
  if (error) return { error: error.message };

  revalidatePath("/marquee");
  return { error: null };
}

// Rename / recategorize an asset. RLS allows the uploader or owners/production.
export async function updatePromoAsset(id: string, caption: string, category: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const patch: { caption: string | null; category?: string } = {
    caption: caption?.trim() || null,
  };
  if (VALID_CATEGORIES.includes(category)) patch.category = category;

  const { data, error } = await supabase
    .from("promo_assets").update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't save — you can only edit files you uploaded." };

  revalidatePath("/marquee");
  return { error: null };
}

// Record metadata after the browser has uploaded the file straight to storage.
export async function recordPromoAsset(input: {
  productionId: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string;
  category: string;
  durationSeconds: number | null;
  taggedPersonIds?: string[];
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: production } = await supabase
    .from("productions").select("org_id, title").eq("id", input.productionId).single();
  if (!production) return { error: "Production not found." };

  // Auto-approve uploads from production leadership.
  const isOfficial = await isProductionLeadership(supabase, me.id, input.productionId, production.org_id);

  const category = VALID_CATEGORIES.includes(input.category) ? input.category : "other";
  const { data, error } = await supabase
    .from("promo_assets")
    .insert({
      org_id: production.org_id,
      production_id: input.productionId,
      uploaded_by: me.id,
      file_path: input.filePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      caption: input.caption?.trim() || null,
      is_official: isOfficial,
      category,
      duration_seconds: input.durationSeconds,
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't save the upload." };

  const tagIds = (input.taggedPersonIds || []).filter((pid) => pid !== me.id);
  if (tagIds.length > 0) {
    await applyTags(supabase, data[0].id, tagIds, tagIds, {
      orgId: production.org_id,
      productionTitle: production.title || "",
      categoryLabel: CATEGORY_LABEL[category] || "Other",
    });
  }

  revalidatePath("/marquee");
  return { error: null };
}

// Replace an asset's tags; notify only people who are newly added.
export async function setPromoTags(assetId: string, personIds: string[]) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: asset } = await supabase
    .from("promo_assets")
    .select("id, org_id, category, productions(title)")
    .eq("id", assetId)
    .single();
  if (!asset) return { error: "File not found." };

  const { data: existing } = await supabase
    .from("promo_asset_tags").select("person_id").eq("asset_id", assetId);
  const existingIds = new Set((existing || []).map((t) => t.person_id));
  const want = new Set(personIds.filter(Boolean));

  const toAdd = [...want].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !want.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("promo_asset_tags").delete().eq("asset_id", assetId).in("person_id", toRemove);
    if (delErr) return { error: delErr.message };
  }
  if (toAdd.length > 0) {
    const prodTitle = (asset.productions as unknown as { title: string } | null)?.title || "";
    const { error: addErr } = await supabase
      .from("promo_asset_tags")
      .insert(toAdd.map((pid) => ({ asset_id: assetId, person_id: pid })))
      .select("asset_id");
    if (addErr) return { error: addErr.message };
    for (const pid of toAdd.filter((id) => id !== me.id)) {
      createNotification({
        personId: pid,
        orgId: asset.org_id,
        type: "promo_tag",
        title: "You were tagged in Marquee",
        body: `${CATEGORY_LABEL[asset.category] || "Other"}${prodTitle ? ` · ${prodTitle}` : ""}`,
        link: "/marquee",
      }).catch(() => {});
    }
  }

  revalidatePath("/marquee");
  return { error: null };
}

export async function deletePromoAsset(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: asset } = await supabase
    .from("promo_assets").select("id, file_path, uploaded_by, org_id").eq("id", id).single();
  if (!asset) return { error: "File not found." };

  // Uploader, or an owner/production member of the org, may delete.
  let allowed = asset.uploaded_by === me.id;
  if (!allowed) {
    const { data: mem } = await supabase
      .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", asset.org_id).maybeSingle();
    allowed = !!mem && (mem.role === "owner" || mem.role === "production");
  }
  if (!allowed) return { error: "You can only remove files you uploaded." };

  // Remove the stored object with the service-role client, then the row.
  const admin = createAdminClient();
  await admin.storage.from("promo-assets").remove([asset.file_path]);
  const { error } = await supabase.from("promo_assets").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/marquee");
  return { error: null };
}

// Fresh signed URL that forces a download of the original, full-resolution file.
export async function getPromoDownloadUrl(path: string, fileName: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("promo-assets")
    .createSignedUrl(path, 120, { download: fileName });
  if (error || !data) return { error: error?.message || "Couldn't open the file.", url: null };
  return { error: null, url: data.signedUrl };
}

// --- Headshots ---------------------------------------------------------------
// Headshots live on people.headshot_url (portable across orgs and shows), stored
// as a path in the promo-assets bucket. A person may set their own; production
// leadership may set any roster member's, so the program can be assembled even
// when a member hasn't uploaded their own.

async function canManageHeadshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meId: string,
  targetPersonId: string,
  productionId: string
): Promise<boolean> {
  if (meId === targetPersonId) return true;
  const { data: prod } = await supabase
    .from("productions").select("org_id").eq("id", productionId).maybeSingle();
  if (!prod) return false;
  return isProductionLeadership(supabase, meId, productionId, prod.org_id);
}

export async function setPersonHeadshot(input: {
  personId: string;
  productionId: string;
  filePath: string;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  if (!(await canManageHeadshot(supabase, me.id, input.personId, input.productionId))) {
    return { error: "You don't have permission to set this headshot." };
  }

  // Remove the previous headshot file from storage so we don't orphan it.
  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("people").select("headshot_url").eq("id", input.personId).maybeSingle();

  const { error } = await admin
    .from("people")
    .update({ headshot_url: input.filePath })
    .eq("id", input.personId);
  if (error) return { error: error.message };

  if (prev?.headshot_url && prev.headshot_url !== input.filePath) {
    await admin.storage.from("promo-assets").remove([prev.headshot_url]).catch(() => {});
  }

  revalidatePath("/marquee");
  return { error: null };
}

export async function clearPersonHeadshot(input: {
  personId: string;
  productionId: string;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  if (!(await canManageHeadshot(supabase, me.id, input.personId, input.productionId))) {
    return { error: "You don't have permission to remove this headshot." };
  }

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("people").select("headshot_url").eq("id", input.personId).maybeSingle();

  const { error } = await admin
    .from("people").update({ headshot_url: null }).eq("id", input.personId);
  if (error) return { error: error.message };

  if (prev?.headshot_url) {
    await admin.storage.from("promo-assets").remove([prev.headshot_url]).catch(() => {});
  }

  revalidatePath("/marquee");
  return { error: null };
}
