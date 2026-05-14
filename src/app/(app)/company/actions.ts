"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateMember(formData: FormData) {
  const supabase = await createClient();

  const personId = formData.get("person_id") as string;
  const fullName = formData.get("full_name") as string;
  const preferredName = (formData.get("preferred_name") as string) || null;
  const pronouns = (formData.get("pronouns") as string) || null;
  const email = (formData.get("email") as string) || null;
  const phone = (formData.get("phone") as string) || null;

  const { error } = await supabase
    .from("people")
    .update({
      full_name: fullName,
      preferred_name: preferredName,
      pronouns,
      email,
      phone,
    })
    .eq("id", personId);

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}

export async function updateMemberRole(
  orgId: string,
  personId: string,
  role: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("org_memberships")
    .update({ role })
    .eq("org_id", orgId)
    .eq("person_id", personId);

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}

export async function updateAssignment(formData: FormData) {
  const supabase = await createClient();

  const assignmentId = formData.get("assignment_id") as string;
  const roleTitle = formData.get("role_title") as string;
  const department = formData.get("department") as string;
  const accessTier = formData.get("access_tier") as string;
  const castingStructure = (formData.get("casting_structure") as string) || null;

  const { error } = await supabase
    .from("production_assignments")
    .update({
      role_title: roleTitle,
      department,
      access_tier: accessTier,
      casting_structure: castingStructure || null,
    })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}

export async function addAssignment(formData: FormData) {
  const supabase = await createClient();

  const personId = formData.get("person_id") as string;
  const productionId = formData.get("production_id") as string;
  const roleTitle = formData.get("role_title") as string;
  const department = formData.get("department") as string;
  const accessTier = formData.get("access_tier") as string;
  const castingStructure = (formData.get("casting_structure") as string) || null;

  const { error } = await supabase
    .from("production_assignments")
    .insert({
      production_id: productionId,
      person_id: personId,
      role_title: roleTitle,
      department,
      access_tier: accessTier,
      casting_structure: castingStructure || null,
    });

  if (error) return { error: error.message };

  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}

export async function removeMember(orgId: string, personId: string) {
  const supabase = await createClient();

  // Deactivate all production assignments in this org
  const { data: productions } = await supabase
    .from("productions")
    .select("id")
    .eq("org_id", orgId);

  if (productions) {
    for (const prod of productions) {
      await supabase
        .from("production_assignments")
        .update({ active: false })
        .eq("production_id", prod.id)
        .eq("person_id", personId);
    }
  }

  // Remove org membership
  const { error } = await supabase
    .from("org_memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("person_id", personId);

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}
