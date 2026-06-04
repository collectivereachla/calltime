"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, full_name, preferred_name, pronouns, email, phone, bio, birth_month, birth_day, is_minor"
    )
    .eq("user_id", user.id)
    .single();

  return person;
}

export async function updateProfile(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!person) return { error: "Profile not found" };

  const updates: Record<string, unknown> = {};
  const fields = [
    "full_name",
    "preferred_name",
    "pronouns",
    "phone",
    "bio",
  ];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      updates[field] = (value as string) || null;
    }
  }

  // full_name is required
  if (!updates.full_name) {
    return { error: "Full name is required" };
  }

  // Handle birth month/day
  const birthMonth = formData.get("birth_month");
  const birthDay = formData.get("birth_day");
  if (birthMonth) updates.birth_month = parseInt(birthMonth as string) || null;
  if (birthDay) updates.birth_day = parseInt(birthDay as string) || null;

  const { error } = await supabase
    .from("people")
    .update(updates)
    .eq("id", person.id);

  if (error) return { error: error.message };

  // Update email in auth if changed
  const newEmail = formData.get("email") as string;
  if (newEmail && newEmail !== user.email) {
    const { error: emailErr } = await supabase.auth.updateUser({
      email: newEmail,
    });
    if (emailErr) {
      return { error: `Profile saved but email change failed: ${emailErr.message}` };
    }
    // Also update in people table
    await supabase.from("people").update({ email: newEmail }).eq("id", person.id);
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function changePassword(formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const newPassword = formData.get("new_password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!newPassword || newPassword.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Passwords don't match" };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) return { error: error.message };

  return { success: true };
}

export async function toggleRoomLock(productionId: string, roomKey: string, lock: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: prod } = await supabase
    .from("productions")
    .select("locked_rooms")
    .eq("id", productionId)
    .single();

  if (!prod) return { error: "Production not found" };

  let lockedRooms: string[] = prod.locked_rooms || [];
  if (lock && !lockedRooms.includes(roomKey)) {
    lockedRooms = [...lockedRooms, roomKey];
  } else if (!lock) {
    lockedRooms = lockedRooms.filter((r) => r !== roomKey);
  }

  const { error } = await supabase
    .from("productions")
    .update({ locked_rooms: lockedRooms })
    .eq("id", productionId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true, lockedRooms };
}

export async function updateOrganization(orgId: string, formData: FormData) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_organization_safe", {
    p_org_id: orgId,
    p_name: formData.get("name") as string,
    p_description: (formData.get("description") as string) || null,
    p_city: (formData.get("city") as string) || null,
    p_state: (formData.get("state") as string) || null,
    p_website: (formData.get("website") as string) || null,
    p_logo_url: (formData.get("logo_url") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/org");
  return { success: true };
}
