"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One-time migration: pull each costume photo that still lives on Google Drive
// into Calltime's own storage bucket, then repoint the row. Runs server-side on
// Vercel (which can reach both Drive's public thumbnail endpoint and Supabase
// storage). Processes a small batch per call so it never hits a function
// timeout; the client loops until `remaining` is 0. Idempotent: a row that
// fails is left pointing at Drive and retried on the next run.
export async function migrateCostumePhotos(orgId: string, limit = 6) {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("costume_inventory")
    .select("id, drive_file_id, thumbnail_url")
    .eq("org_id", orgId)
    .like("thumbnail_url", "%drive.google.com%")
    .not("drive_file_id", "is", null)
    .limit(limit);

  if (error) return { error: error.message, migrated: 0, failed: 0, remaining: -1 };

  let migrated = 0;
  let failed = 0;

  for (const row of rows || []) {
    try {
      const driveUrl = `https://drive.google.com/thumbnail?id=${row.drive_file_id}&sz=w1600`;
      const res = await fetch(driveUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { failed++; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // A real garment photo is well over 1KB; a tiny payload means Drive
      // returned a placeholder rather than the image.
      if (buf.byteLength < 2048) { failed++; continue; }

      const path = `${orgId}/migrated/${row.drive_file_id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("costume-photos")
        .upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (upErr) { failed++; continue; }

      const { data: urlData } = supabase.storage.from("costume-photos").getPublicUrl(path);
      const { data: upd, error: updErr } = await supabase
        .from("costume_inventory")
        .update({ thumbnail_url: urlData.publicUrl })
        .eq("id", row.id)
        .select("id");
      if (updErr || !upd || upd.length === 0) { failed++; continue; }

      migrated++;
    } catch {
      failed++;
    }
  }

  const { count } = await supabase
    .from("costume_inventory")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("thumbnail_url", "%drive.google.com%")
    .not("drive_file_id", "is", null);

  revalidatePath("/booth");
  return { error: null, migrated, failed, remaining: count ?? 0 };
}
