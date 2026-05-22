"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification, notifyOrgOwners } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { logAudit } from "@/lib/audit-log";

export async function signContract(formData: FormData) {
  const supabase = await createClient();

  const contractId = formData.get("contract_id") as string;
  const signatureTyped = formData.get("signature_typed") as string;
  const signatureDrawUrl = formData.get("signature_draw_url") as string | null;

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
    .select("id, person_id, person_name, role_title, status, production_id")
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
      signature_draw_url: signatureDrawUrl || null,
      viewed_at: contract.status === "pending" ? new Date().toISOString() : undefined,
    })
    .eq("id", contractId);

  if (error) return { error: error.message };

  // Notify org owners that a contract was signed and needs countersign
  const { data: production } = await supabase
    .from("productions")
    .select("org_id")
    .eq("id", contract.production_id)
    .single();

  if (production) {
    notifyOrgOwners(production.org_id, {
      type: "contract_signed",
      title: `${contract.person_name} signed their contract`,
      body: `${contract.role_title} — ready for your countersignature.`,
      link: `/ledger`,
      metadata: { contract_id: contractId, production_id: contract.production_id },
    });

    logActivity({
      productionId: contract.production_id,
      orgId: production.org_id,
      actorPersonId: person.id,
      action: "contract_signed",
      entityType: "contract",
      entityId: contractId,
      summary: `${contract.person_name} signed their ${contract.role_title} contract`,
    }).catch(() => {});

    logAudit({
      action: "sign_contract",
      entityType: "contract",
      entityId: contractId,
      targetPersonId: contract.person_id,
      orgId: production.org_id,
    }).catch(() => {});
  }

  revalidatePath("/ledger");
  return { success: true };
}

export async function countersignContract(formData: FormData) {
  const supabase = await createClient();

  const contractId = formData.get("contract_id") as string;
  const signatureTyped = formData.get("signature_typed") as string;
  const signatureDrawUrl = formData.get("signature_draw_url") as string | null;

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

  // Get contract details for notification
  const { data: contract } = await supabase
    .from("contracts")
    .select("person_id, person_name, role_title, production_id")
    .eq("id", contractId)
    .single();

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "countersigned",
      countersigned_at: new Date().toISOString(),
      countersigned_by: person.id,
      countersigned_typed: signatureTyped.trim(),
      countersigned_draw_url: signatureDrawUrl || null,
    })
    .eq("id", contractId);

  if (error) return { error: error.message };

  // Notify the contract holder that their contract is fully executed
  if (contract) {
    const { data: production } = await supabase
      .from("productions")
      .select("org_id")
      .eq("id", contract.production_id)
      .single();

    if (production) {
      createNotification({
        personId: contract.person_id,
        orgId: production.org_id,
        type: "contract_countersigned",
        title: "Your contract has been countersigned",
        body: `Your ${contract.role_title} contract is now fully executed. You can view and print it in the Ledger.`,
        link: `/ledger`,
        metadata: { contract_id: contractId, production_id: contract.production_id },
      });

      logActivity({
        productionId: contract.production_id,
        orgId: production.org_id,
        actorPersonId: person.id,
        action: "contract_countersigned",
        entityType: "contract",
        entityId: contractId,
        summary: `Countersigned ${contract.person_name}'s ${contract.role_title} contract`,
      }).catch(() => {});

      logAudit({
        action: "countersign_contract",
        entityType: "contract",
        entityId: contractId,
        targetPersonId: contract.person_id,
        orgId: production.org_id,
      }).catch(() => {});
    }
  }
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

  logAudit({
    action: "view_contract",
    entityType: "contract",
    entityId: contractId,
  }).catch(() => {});
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

export async function voidContract(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (!membership || !["owner", "production"].includes(membership.role)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("contracts")
    .update({ status: "void" })
    .eq("id", id);
  if (error) return { error: error.message };

  logAudit({
    action: "void_contract",
    entityType: "contract",
    entityId: id,
  }).catch(() => {});

  revalidatePath("/ledger");
  return { success: true };
}

// ---------- Template CRUD ----------

export async function updateTemplate(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can edit templates" };

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  const body_markdown = formData.get("body_markdown") as string;

  if (!id) return { error: "Template ID required" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title) updates.title = title;
  if (body_markdown) updates.body_markdown = body_markdown;

  const { error } = await supabase.from("contract_templates").update(updates).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can create templates" };

  const productionId = formData.get("production_id") as string;
  const contractType = formData.get("contract_type") as string;
  const title = formData.get("title") as string;
  const bodyMarkdown = formData.get("body_markdown") as string;

  if (!productionId || !contractType || !title) {
    return { error: "Production, type, and title are required" };
  }

  const { error } = await supabase.from("contract_templates").insert({
    production_id: productionId,
    contract_type: contractType,
    title: title,
    body_markdown: bodyMarkdown || "",
  });

  if (error) return { error: error.message };
  revalidatePath("/ledger");
  return { success: true };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people").select("id").eq("user_id", user.id).single();
  const { data: membership } = await supabase
    .from("org_memberships").select("role").eq("person_id", person!.id).limit(1).single();

  if (membership?.role !== "owner") return { error: "Only owners can delete templates" };

  // Check for existing contracts using this template
  const { count } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);

  if (count && count > 0) {
    return { error: `Cannot delete — ${count} contract(s) use this template. Remove those contracts first.` };
  }

  const { error } = await supabase.from("contract_templates").delete().eq("id", id);
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
