"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProduction(formData: FormData) {
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

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("person_id", person.id)
    .limit(1)
    .single();
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

  // Create the production
  const { data: production, error: prodError } = await supabase
    .from("productions")
    .insert({
      org_id: membership.org_id,
      title,
      playwright,
      venue,
      first_rehearsal: firstRehearsal || null,
      opening_date: openingDate || null,
      closing_date: closingDate || null,
      has_music: hasMusic,
      has_choreography: hasChoreography,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (prodError) {
    return { error: prodError.message };
  }

  // Auto-assign creator with their org-level access tier
  const creatorRole = (formData.get("creator_role") as string) || "Director";
  const { error: assignError } = await supabase
    .from("production_assignments")
    .insert({
      production_id: production.id,
      person_id: person.id,
      role_title: creatorRole,
      department: "directing",
      access_tier: membership.role, // owner stays owner, production stays production
    });

  if (assignError) {
    console.error("Failed to assign creator:", assignError);
  }

  revalidatePath("/home");
  redirect(`/productions/${production.id}`);
}

export async function addPersonToProduction(formData: FormData) {
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

  const { error } = await supabase.rpc("invite_person_to_production", {
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

  revalidatePath(`/productions/${productionId}`);
  revalidatePath("/company");
  revalidatePath("/home");
  return { success: true };
}
