"use server";
import { assertNotPreviewing } from "@/lib/viewer";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification, notifyOrgOwners } from "@/lib/notifications";
import { canManageFinance, orgIdForProduction } from "@/lib/membership";

async function currentPersonId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  return person?.id ?? null;
}

type EmbeddedContract = {
  person_id: string;
  person_name: string;
  role_title: string;
  compensation: string | null;
  status: string;
  production_id: string;
};

function oneContract(c: EmbeddedContract | EmbeddedContract[] | null): EmbeddedContract | null {
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

// Owner proposes a compensation change on a signed contract -> creates a pending addendum.
export async function createAddendum(formData: FormData) {
  await assertNotPreviewing();
  const personId = await currentPersonId();
  if (!personId) return { error: "Not authenticated" };

  const contractId = formData.get("contract_id") as string;
  const reason = ((formData.get("reason") as string) || "").trim() || null;
  const newComp = ((formData.get("new_compensation") as string) || "").trim();
  if (!contractId || !newComp) return { error: "A contract and the new compensation are required." };

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("id, person_id, person_name, role_title, compensation, status, production_id")
    .eq("id", contractId)
    .single();
  if (!contract) return { error: "Contract not found" };
  if (contract.status !== "signed" && contract.status !== "countersigned") {
    return { error: "Addendums apply to signed contracts. While a contract is still pending, edit the figure directly." };
  }

  const orgId = await orgIdForProduction(contract.production_id);
  if (!(await canManageFinance(personId, orgId))) return { error: "Only owners can propose a contract change." };

  // The "from" figure is the current effective one: the latest executed addendum, else the contract.
  const { data: priorCs } = await admin
    .from("contract_addendums")
    .select("new_compensation")
    .eq("contract_id", contractId)
    .eq("status", "countersigned")
    .order("countersigned_at", { ascending: false })
    .limit(1);
  const oldComp = priorCs?.[0]?.new_compensation ?? contract.compensation;

  const body = [
    "ADDENDUM TO AGREEMENT",
    "",
    `This Addendum modifies the ${contract.role_title} agreement with ${contract.person_name}.`,
    "",
    `Compensation is changed from ${oldComp || "\u2014"} to ${newComp}.`,
    reason ? `Reason: ${reason}` : "",
    "",
    "All other terms of the original agreement remain in full force. This Addendum takes effect only when signed by both parties below.",
  ].filter(Boolean).join("\n");

  const { error } = await admin.from("contract_addendums").insert({
    contract_id: contractId,
    production_id: contract.production_id,
    reason,
    old_compensation: oldComp,
    new_compensation: newComp,
    body_markdown: body,
    status: "pending",
    created_by: personId,
  });
  if (error) return { error: error.message };

  if (orgId) {
    createNotification({
      personId: contract.person_id,
      orgId,
      type: "contract_addendum",
      title: "A change to your contract needs your signature",
      body: `Your ${contract.role_title} compensation is proposed to change to ${newComp}. Review and sign in the Ledger.`,
      link: "/ledger",
      metadata: { contract_id: contractId },
    }).catch(() => {});
  }
  revalidatePath("/ledger");
  return { success: true };
}

// The contracted person signs a pending addendum.
export async function signAddendum(formData: FormData) {
  await assertNotPreviewing();
  const personId = await currentPersonId();
  if (!personId) return { error: "Not authenticated" };

  const addendumId = formData.get("addendum_id") as string;
  const signatureTyped = ((formData.get("signature_typed") as string) || "").trim();
  const signatureDrawUrl = (formData.get("signature_draw_url") as string) || null;
  if (!addendumId || !signatureTyped) return { error: "A typed signature is required." };

  const admin = createAdminClient();
  const { data: add } = await admin
    .from("contract_addendums")
    .select("id, status, contracts(person_id, person_name, role_title, compensation, status, production_id)")
    .eq("id", addendumId)
    .single();
  if (!add) return { error: "Addendum not found" };
  const contract = oneContract(add.contracts as EmbeddedContract | EmbeddedContract[] | null);
  if (!contract) return { error: "Contract not found" };
  if (contract.person_id !== personId) return { error: "This is not your contract." };
  if (add.status !== "pending") return { error: "This addendum is no longer awaiting your signature." };

  const { error } = await admin
    .from("contract_addendums")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_typed: signatureTyped,
      signature_draw_url: signatureDrawUrl,
    })
    .eq("id", addendumId);
  if (error) return { error: error.message };

  const orgId = await orgIdForProduction(contract.production_id);
  if (orgId) {
    notifyOrgOwners(orgId, {
      type: "contract_addendum_signed",
      title: `${contract.person_name} signed a contract change`,
      body: `${contract.role_title} addendum — ready for your countersignature.`,
      link: "/ledger",
      metadata: { addendum_id: addendumId },
    });
  }
  revalidatePath("/ledger");
  return { success: true };
}

// Owner countersigns -> the new figure becomes effective.
export async function countersignAddendum(formData: FormData) {
  await assertNotPreviewing();
  const personId = await currentPersonId();
  if (!personId) return { error: "Not authenticated" };

  const addendumId = formData.get("addendum_id") as string;
  const signatureTyped = ((formData.get("signature_typed") as string) || "").trim();
  const signatureDrawUrl = (formData.get("signature_draw_url") as string) || null;
  if (!addendumId || !signatureTyped) return { error: "A typed signature is required." };

  const admin = createAdminClient();
  const { data: add } = await admin
    .from("contract_addendums")
    .select("id, status, new_compensation, contracts(person_id, person_name, role_title, compensation, status, production_id)")
    .eq("id", addendumId)
    .single();
  if (!add) return { error: "Addendum not found" };
  const contract = oneContract(add.contracts as EmbeddedContract | EmbeddedContract[] | null);
  if (!contract) return { error: "Contract not found" };
  if (add.status !== "signed") return { error: "This addendum is not awaiting countersignature." };

  const orgId = await orgIdForProduction(contract.production_id);
  if (!(await canManageFinance(personId, orgId))) return { error: "Only owners can countersign." };

  const { error } = await admin
    .from("contract_addendums")
    .update({
      status: "countersigned",
      countersigned_at: new Date().toISOString(),
      countersigned_by: personId,
      countersigned_typed: signatureTyped,
      countersigned_draw_url: signatureDrawUrl,
    })
    .eq("id", addendumId);
  if (error) return { error: error.message };

  if (orgId) {
    createNotification({
      personId: contract.person_id,
      orgId,
      type: "contract_addendum_countersigned",
      title: "Your contract change is now in effect",
      body: `Your ${contract.role_title} compensation is now ${add.new_compensation}.`,
      link: "/ledger",
      metadata: { addendum_id: addendumId },
    }).catch(() => {});
  }
  revalidatePath("/ledger");
  return { success: true };
}

// Owner voids an addendum that hasn't been fully executed.
export async function voidAddendum(addendumId: string) {
  await assertNotPreviewing();
  const personId = await currentPersonId();
  if (!personId) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: add } = await admin
    .from("contract_addendums")
    .select("id, status, contracts(production_id)")
    .eq("id", addendumId)
    .single();
  if (!add) return { error: "Addendum not found" };
  const contract = oneContract(add.contracts as EmbeddedContract | EmbeddedContract[] | null);
  const orgId = contract ? await orgIdForProduction(contract.production_id) : null;
  if (!(await canManageFinance(personId, orgId))) return { error: "Only owners can void an addendum." };
  if (add.status === "countersigned") {
    return { error: "An executed addendum can't be voided. Create a new addendum to change the figure again." };
  }
  const { error } = await admin.from("contract_addendums").update({ status: "void" }).eq("id", addendumId);
  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}
