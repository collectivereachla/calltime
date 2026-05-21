"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendWelcomeEmail } from "@/lib/email-triggers";

export async function approveApplication(
  applicationId: string,
  assignedRole: string,
  department: string,
  accessTier: string
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch the application
  const { data: app } = await supabase
    .from("applications")
    .select("id, person_id, production_id, status, productions(org_id)")
    .eq("id", applicationId)
    .single();

  if (!app || app.status !== "submitted") {
    return { error: "Application not found or already processed" };
  }

  const orgId = (app.productions as unknown as { org_id: string }).org_id;

  // Get reviewer person_id
  const { data: reviewer } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!reviewer) return { error: "Reviewer not found" };

  // 1. Update application
  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      status: "accepted",
      assigned_role: assignedRole,
      assigned_access_tier: accessTier,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateErr) return { error: updateErr.message };

  // 2. Ensure org membership exists
  const { data: existing } = await supabase
    .from("org_memberships")
    .select("id")
    .eq("person_id", app.person_id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existing) {
    const { error: memberErr } = await supabase
      .from("org_memberships")
      .insert({
        person_id: app.person_id,
        org_id: orgId,
        role: "member",
        status: "active",
      });

    if (memberErr) {
      console.error(
        "Failed to create org membership for person",
        app.person_id,
        "in org",
        orgId,
        ":",
        memberErr.message
      );
      return { error: `Failed to add to organization: ${memberErr.message}` };
    }
  } else {
    const { error: activateErr } = await supabase
      .from("org_memberships")
      .update({ status: "active" })
      .eq("id", existing.id);

    if (activateErr) {
      console.error("Failed to activate membership:", activateErr.message);
    }
  }

  // 3. Create production assignment
  const { error: assignErr } = await supabase
    .from("production_assignments")
    .insert({
      person_id: app.person_id,
      production_id: app.production_id,
      role_title: assignedRole,
      department,
      access_tier: accessTier,
      active: true,
    });

  if (assignErr) {
    console.error("Failed to create production assignment:", assignErr.message);
    return { error: `Failed to assign to production: ${assignErr.message}` };
  }

  // 4. Send welcome email
  sendWelcomeEmail({
    personId: app.person_id,
    productionId: app.production_id,
    roleTitle: assignedRole,
    department,
  }).catch(() => {});

  revalidatePath("/applications");
  return { success: true };
}

export async function declineApplication(applicationId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: reviewer } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!reviewer) return { error: "Reviewer not found" };

  const { error } = await supabase
    .from("applications")
    .update({
      status: "declined",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("status", "submitted");

  if (error) return { error: error.message };

  revalidatePath("/applications");
  return { success: true };
}
