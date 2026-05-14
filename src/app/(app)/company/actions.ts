"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateMember(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_person_profile", {
    p_person_id: formData.get("person_id") as string,
    p_full_name: formData.get("full_name") as string,
    p_preferred_name: (formData.get("preferred_name") as string) || null,
    p_pronouns: (formData.get("pronouns") as string) || null,
    p_email: (formData.get("email") as string) || null,
    p_phone: (formData.get("phone") as string) || null,
  });

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

  const { error } = await supabase.rpc("update_member_role", {
    p_org_id: orgId,
    p_person_id: personId,
    p_role: role,
  });

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}

export async function updateAssignment(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_production_assignment", {
    p_assignment_id: formData.get("assignment_id") as string,
    p_role_title: formData.get("role_title") as string,
    p_department: formData.get("department") as string,
    p_access_tier: formData.get("access_tier") as string,
    p_casting_structure: (formData.get("casting_structure") as string) || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}

export async function addAssignment(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("add_production_assignment", {
    p_person_id: formData.get("person_id") as string,
    p_production_id: formData.get("production_id") as string,
    p_role_title: formData.get("role_title") as string,
    p_department: formData.get("department") as string,
    p_access_tier: formData.get("access_tier") as string,
    p_casting_structure: (formData.get("casting_structure") as string) || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}

export async function removeMember(orgId: string, personId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("remove_org_member", {
    p_org_id: orgId,
    p_person_id: personId,
  });

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}
