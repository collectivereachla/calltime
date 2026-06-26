"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";
import { sendWelcomeEmail } from "@/lib/email-triggers";

export async function createProduction(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get person + org
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!person) return { error: "No profile found" };

  const actingOrgId = await resolveActingOrgId(person.id);
  if (!actingOrgId) return { error: "No organization found" };
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", person.id)
    .eq("org_id", actingOrgId)
    .maybeSingle();
  if (!membership) return { error: "No organization found" };
  if (membership.role !== "owner" && membership.role !== "production") {
    return { error: "Only owners and production staff can create productions" };
  }

  const title = formData.get("title") as string;
  const playwright = (formData.get("playwright") as string) || null;
  const venue = (formData.get("venue") as string) || null;
  const firstRehearsal = (formData.get("first_rehearsal") as string) || null;
  const openingDate = (formData.get("opening_date") as string) || null;
  const closingDate = (formData.get("closing_date") as string) || null;
  const hasMusic = formData.get("has_music") === "on";
  const hasChoreography = formData.get("has_choreography") === "on";
  const acceptingApplications = formData.get("accepting_applications") === "on";
  const visibility = (formData.get("visibility") as string) || "private";
  const openCallDescription = (formData.get("open_call_description") as string) || null;
  const openCallDeadline = (formData.get("open_call_deadline") as string) || null;
  const applicationTypesRaw = formData.get("application_types") as string;
  const applicationTypes = applicationTypesRaw ? JSON.parse(applicationTypesRaw) : [];

  // Create the production
  const { data: production, error: prodError } = await supabase
    .from("productions")
    .insert({
      org_id: actingOrgId,
      title,
      playwright,
      venue,
      first_rehearsal: firstRehearsal || null,
      opening_date: openingDate || null,
      closing_date: closingDate || null,
      has_music: hasMusic,
      has_choreography: hasChoreography,
      accepting_applications: acceptingApplications,
      visibility,
      open_call_description: openCallDescription,
      open_call_deadline: openCallDeadline || null,
      application_types: applicationTypes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (prodError) {
    return { error: prodError.message };
  }

  // Auto-assign creator with admin access
  const creatorRole = (formData.get("creator_role") as string) || "Director";
  const creatorDepartment = (formData.get("creator_department") as string) || "directing";
  const { error: assignError } = await supabase
    .from("production_assignments")
    .insert({
      production_id: production.id,
      person_id: person.id,
      role_title: creatorRole,
      department: creatorDepartment,
      access_tier: "admin", // creator always gets full access
    });

  if (assignError) {
    console.error("Failed to assign creator:", assignError);
  }

  revalidatePath("/home");
  redirect(`/productions/${production.id}`);
}

export async function addPersonToProduction(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const productionId = formData.get("production_id") as string;
  const fullName = formData.get("full_name") as string;
  const email = (formData.get("email") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const roleTitle = formData.get("role_title") as string;
  const department = formData.get("department") as string;
  const accessTier = formData.get("access_tier") as string;
  const castingStructure = (formData.get("casting_structure") as string) || null;

  const { data: personId, error } = await supabase.rpc("invite_person_to_production", {
    p_production_id: productionId,
    p_full_name: fullName,
    p_email: email,
    p_phone: phone,
    p_role_title: roleTitle,
    p_department: department,
    p_access_tier: accessTier,
    p_casting_structure: castingStructure,
  });

  if (error) {
    return { error: error.message };
  }

  // Send welcome email (fire-and-forget)
  if (personId) {
    sendWelcomeEmail({
      personId,
      productionId,
      roleTitle,
      department,
    }).catch(() => {});
  }

  revalidatePath(`/productions/${productionId}`);
  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}

// Manage a production's Open Call (auditions/applications) AFTER creation.
// RLS ("Owner and production can update productions") is the real guard; we also
// check here for a clean error message. Lets owners open/close auditions on
// existing shows, set which application types are accepted, the blurb, and a deadline.
export async function updateOpenCall(
  productionId: string,
  input: { accepting: boolean; types: string[]; description: string | null; deadline: string | null }
) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "Profile not found" };
  const { data: prod } = await supabase.from("productions").select("org_id").eq("id", productionId).single();
  if (!prod) return { error: "Production not found" };
  const { data: mem } = await supabase
    .from("org_memberships").select("role")
    .eq("person_id", me.id).eq("org_id", prod.org_id).maybeSingle();
  if (!mem || !["owner", "production"].includes(mem.role as string)) {
    return { error: "Only production leadership can manage open call." };
  }
  const { error } = await supabase
    .from("productions")
    .update({
      accepting_applications: input.accepting,
      application_types: input.types,
      open_call_description: input.description,
      open_call_deadline: input.deadline,
    })
    .eq("id", productionId);
  if (error) return { error: error.message };
  revalidatePath(`/productions/${productionId}`);
  return { success: true };
}
