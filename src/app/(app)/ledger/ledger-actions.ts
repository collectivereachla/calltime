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
