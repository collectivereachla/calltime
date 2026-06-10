"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function logWeaponCustody(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: me } = await supabase
    .from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { error: "No person record found." };

  const productionId = formData.get("production_id") as string;
  const propId = formData.get("prop_id") as string;
  const action = formData.get("action") as string;
  const custodianPersonId = (formData.get("custodian_person_id") as string) || null;
  const chamberVerified = formData.get("chamber_verified") === "on";
  const smPersonId = (formData.get("sm_person_id") as string) || null;
  const smSignature = ((formData.get("sm_signature") as string) || "").trim() || null;
  const directorPersonId = (formData.get("director_person_id") as string) || null;
  const directorSignature = ((formData.get("director_signature") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  if (!productionId || !propId || !["check_out", "check_in"].includes(action)) {
    return { error: "Missing required fields." };
  }
  if (!chamberVerified) {
    return { error: "Chamber verification is required before logging." };
  }
  if (!smSignature || !directorSignature) {
    return { error: "Both Stage Manager and Director signatures are required." };
  }

  const { error } = await supabase.from("prop_custody_log").insert({
    production_id: productionId,
    prop_id: propId,
    action,
    custodian_person_id: custodianPersonId,
    chamber_verified: chamberVerified,
    sm_person_id: smPersonId,
    sm_signature: smSignature,
    director_person_id: directorPersonId,
    director_signature: directorSignature,
    notes,
    created_by: me.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/run");
  return { success: true };
}
