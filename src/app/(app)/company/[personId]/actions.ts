"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePublicProfile(personId: string, data: {
  bio?: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(data)
    .eq("id", personId);

  if (error) return { error: error.message };
  revalidatePath(`/company/${personId}`);
  revalidatePath("/company");
  return { success: true };
}

export async function updatePrivateDetails(personId: string, data: {
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  allergies?: string | null;
  dietary_needs?: string | null;
  birth_year?: number | null;
}) {
  const supabase = await createClient();

  // Upsert — might not have a row yet
  const { error } = await supabase
    .from("member_details")
    .upsert({ person_id: personId, ...data, updated_at: new Date().toISOString() },
      { onConflict: "person_id" });

  if (error) return { error: error.message };
  revalidatePath(`/company/${personId}`);
  revalidatePath("/company");
  return { success: true };
}

export async function uploadHeadshot(personId: string, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("headshot") as File;
  if (!file || file.size === 0) return { error: "No file selected" };

  // Validate: images only, max 5MB
  if (!file.type.startsWith("image/")) return { error: "Must be an image file" };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5MB" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${personId}.${ext}`;

  // Upload (upsert overwrites existing)
  const { error: uploadError } = await supabase.storage
    .from("headshots")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  // Get public URL
  const { data: urlData } = supabase.storage.from("headshots").getPublicUrl(path);

  // Update people record with cache-busting URL
  const url = `${urlData.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("people")
    .update({ headshot_url: url })
    .eq("id", personId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/company/${personId}`);
  revalidatePath("/company");
  return { success: true, url };
}

export async function toggleW9Status(personId: string, submitted: boolean) {
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
}
