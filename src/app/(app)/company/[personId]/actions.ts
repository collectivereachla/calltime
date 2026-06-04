"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePublicProfile(personId: string, data: {
  bio?: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
}) {
  await assertNotPreviewing();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("people")
      .update(data)
      .eq("id", personId);

    if (error) return { error: error.message };
    revalidatePath(`/company/${personId}`);
    revalidatePath("/company");
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function updatePrivateDetails(personId: string, orgId: string, data: {
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  allergies?: string | null;
  dietary_needs?: string | null;
  birth_year?: number | null;
}) {
  await assertNotPreviewing();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("member_details")
      .upsert(
        { person_id: personId, org_id: orgId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "person_id,org_id" }
      );

    if (error) return { error: error.message };
    revalidatePath(`/company/${personId}`);
    revalidatePath("/company");
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function uploadHeadshot(personId: string, imageDataUrl: string) {
  await assertNotPreviewing();
  try {
    const supabase = await createClient();

    // Convert data URL to buffer
    const base64 = imageDataUrl.split(",")[1];
    if (!base64) return { error: "Invalid image data" };
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length > 5 * 1024 * 1024) return { error: "Image too large after compression" };

    const path = `${personId}/headshot.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("headshots")
      .upload(path, buffer, { upsert: true, contentType: "image/jpeg" });

    if (uploadError) return { error: uploadError.message };

    const { data: urlData } = supabase.storage.from("headshots").getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("people")
      .update({ headshot_url: url })
      .eq("id", personId);

    if (updateError) return { error: updateError.message };

    revalidatePath(`/company/${personId}`);
    revalidatePath("/company");
    return { success: true, url };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function toggleW9Status(personId: string, submitted: boolean) {
  await assertNotPreviewing();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("member_details")
      .upsert({
        person_id: personId,
        w9_submitted: submitted,
        w9_submitted_at: submitted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "person_id" });

    if (error) return { error: error.message };
    revalidatePath(`/company/${personId}`);
    revalidatePath("/company");
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}
