"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_CATEGORIES = ["flyer", "photo", "headshot", "highlight", "other"];

// Rename / recategorize an asset. RLS allows the uploader or owners/production.
export async function updatePromoAsset(id: string, caption: string, category: string) {
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
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: production } = await supabase
    .from("productions").select("org_id").eq("id", input.productionId).single();
  if (!production) return { error: "Production not found." };

  // Is this uploader production leadership? (owner/production/admin at the org,
  // or a designer / SM / director / production-tier assignment on this show.)
  let isOfficial = false;
  const { data: mem } = await supabase
    .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", production.org_id).maybeSingle();
  if (mem && ["owner", "production", "admin"].includes(mem.role)) {
    isOfficial = true;
  } else {
    const { data: pa } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("person_id", me.id)
      .eq("production_id", input.productionId)
      .eq("active", true);
    isOfficial = (pa || []).some(
      (a) =>
        ["admin", "production", "staff"].includes(a.access_tier) ||
        ["design", "stage_management", "direction"].includes(a.department)
    );
  }

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
      category: VALID_CATEGORIES.includes(input.category) ? input.category : "other",
      duration_seconds: input.durationSeconds,
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't save the upload." };

  revalidatePath("/marquee");
  return { error: null };
}

export async function deletePromoAsset(id: string) {
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
