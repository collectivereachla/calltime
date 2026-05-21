"use server";

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
