"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signContract(formData: FormData) {
  const supabase = await createClient();

  const contractId = formData.get("contract_id") as string;
  const signatureTyped = formData.get("signature_typed") as string;

  if (!contractId || !signatureTyped?.trim()) {
    return { error: "Contract ID and typed signature are required." };
  }

  // Verify the person owns this contract
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return { error: "No person record" };

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, person_id, status")
    .eq("id", contractId)
    .single();

  if (!contract) return { error: "Contract not found" };
  if (contract.person_id !== person.id) return { error: "This is not your contract" };
  if (contract.status === "signed" || contract.status === "countersigned") {
    return { error: "Contract already signed" };
  }

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_typed: signatureTyped.trim(),
      viewed_at: contract.status === "pending" ? new Date().toISOString() : undefined,
    })
    .eq("id", contractId);

  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function countersignContract(formData: FormData) {
  const supabase = await createClient();

  const contractId = formData.get("contract_id") as string;
  const signatureTyped = formData.get("signature_typed") as string;

  if (!contractId || !signatureTyped?.trim()) {
    return { error: "Contract ID and typed signature are required." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return { error: "No person record" };

  // Verify person is owner/production
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", person.id)
    .in("role", ["owner", "production"])
    .limit(1)
    .single();

  if (!membership) return { error: "Not authorized to countersign" };

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "countersigned",
      countersigned_at: new Date().toISOString(),
      countersigned_by: person.id,
      countersigned_typed: signatureTyped.trim(),
    })
    .eq("id", contractId);

  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function markContractViewed(contractId: string) {
  const supabase = await createClient();

  await supabase
    .from("contracts")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", contractId)
    .is("viewed_at", null);
}

export async function updateContract(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can edit contracts" };

  const id = formData.get("id") as string;
  const updates: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (key === "id") continue;
    updates[key] = (value as string) || null;
  }

  const { error } = await supabase.from("contracts").update(updates).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function deleteContract(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can delete contracts" };

  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function addStaffMember(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role, org_id").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can add staff" };

  const productionId = formData.get("production_id") as string;
  const personName = formData.get("person_name") as string;
  const roleTitle = formData.get("role_title") as string;
  const compensation = formData.get("compensation") as string;

  if (!personName || !roleTitle) return { error: "Name and role are required" };

  // Find or create person record
  let { data: existingPerson } = await supabase
    .from("people").select("id").eq("full_name", personName).limit(1).single();

  let personId: string;
  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const { data: newPerson, error: pErr } = await supabase
      .from("people").insert({ full_name: personName, profile_complete: false }).select("id").single();
    if (pErr || !newPerson) return { error: pErr?.message || "Failed to create person" };
    personId = newPerson.id;

    // Add org membership
    await supabase.from("org_memberships").insert({
      person_id: personId, org_id: membership.org_id, role: "member",
    });
  }

  // Find crew template for this production
  const { data: template } = await supabase
    .from("contract_templates")
    .select("id")
    .eq("production_id", productionId)
    .eq("contract_type", "crew")
    .limit(1)
    .single();

  if (!template) return { error: "No staff contract template found" };

  // Create the contract
  const { error: cErr } = await supabase.from("contracts").insert({
    template_id: template.id,
    production_id: productionId,
    person_id: personId,
    person_name: personName,
    role_title: roleTitle,
    compensation: compensation ? `$${compensation}` : null,
    status: "pending",
  });

  if (cErr) return { error: cErr.message };
  revalidatePath("/ledger");
  return { success: true };
}
