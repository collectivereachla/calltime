"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendWelcomeEmail } from "@/lib/email-triggers";
import { createNotification } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function approveApplication(
  applicationId: string,
  assignedRole: string,
  department: string,
  accessTier: string
) {
  await assertNotPreviewing();
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

  // 5. Push + in-app notification
  const { data: prod } = await supabase
    .from("productions")
    .select("title")
    .eq("id", app.production_id)
    .single();

  createNotification({
    personId: app.person_id,
    orgId,
    type: "application_accepted",
    title: "You've been accepted",
    body: prod ? `Welcome to ${prod.title} — ${assignedRole}` : `Role: ${assignedRole}`,
    link: "/home",
  }).catch(() => {});

  // Activity log
  const { data: applicant } = await supabase
    .from("people").select("full_name, preferred_name").eq("id", app.person_id).single();
  const applicantName = applicant?.preferred_name || applicant?.full_name || "Someone";

  logActivity({
    productionId: app.production_id,
    orgId,
    action: "application_accepted",
    entityType: "application",
    entityId: applicationId,
    summary: `${applicantName} accepted as ${assignedRole}`,
  }).catch(() => {});

  revalidatePath("/applications");
  return { success: true };
}

export async function declineApplication(applicationId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: reviewer } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!reviewer) return { error: "Reviewer not found" };

  // Fetch application details before updating
  const { data: app } = await supabase
    .from("applications")
    .select("person_id, production_id, productions(org_id, title)")
    .eq("id", applicationId)
    .single();

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

  // Push + in-app notification
  if (app) {
    const prod = app.productions as unknown as { org_id: string; title: string };
    createNotification({
      personId: app.person_id,
      orgId: prod.org_id,
      type: "application_declined",
      title: "Application update",
      body: `Your application to ${prod.title} was not accepted at this time`,
      link: "/directory",
    }).catch(() => {});
  }

  revalidatePath("/applications");
  return { success: true };
}

// CRE-45 Phase 2: formal role offers (offer -> accept/decline).
export async function makeRoleOffer(input: {
  productionId: string; personId: string; role: string; department: string;
  accessTier: string; compensation: string; message: string; applicationId: string | null;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("make_role_offer", {
    p_production_id: input.productionId,
    p_person_id: input.personId,
    p_role_title: input.role,
    p_department: input.department || null,
    p_access_tier: input.accessTier || "member",
    p_compensation: input.compensation || null,
    p_message: input.message || null,
    p_application_id: input.applicationId,
  });
  if (error) return { error: error.message };
  const { data: prod } = await supabase.from("productions").select("title, org_id").eq("id", input.productionId).single();
  if (prod) {
    createNotification({
      personId: input.personId,
      orgId: prod.org_id as string,
      type: "role_offer",
      title: "You've been offered a role",
      body: `${input.role} in ${prod.title}`,
      link: "/home",
    }).catch(() => {});
  }
  revalidatePath("/applications");
  return { id: data as string, error: null };
}

export async function respondToRoleOffer(offerId: string, accept: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_role_offer", { p_offer_id: offerId, p_accept: accept });
  if (error) return { error: error.message };
  revalidatePath("/home");
  revalidatePath("/applications");
  return { error: null };
}
