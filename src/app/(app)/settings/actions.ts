"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { normalizePhone } from "@/lib/phone";

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

  if ("phone" in updates) {
    const np = normalizePhone(updates.phone as string | null);
    if (!np.ok) return { error: np.error };
    updates.phone = np.value;
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

export async function setOrgAccentColor(orgId: string, color: string | null) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_accent_color", { p_org_id: orgId, p_color: color });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

export async function setOrgHideAi(orgId: string, hide: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_hide_ai", { p_org_id: orgId, p_hide: hide });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

export async function setHiddenRooms(orgId: string, rooms: string[]) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_hidden_rooms", {
    p_org_id: orgId,
    p_rooms: rooms,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
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

// Set or change your own check-in PIN, for the org you're acting in. A PIN is a
// personal credential, so each member sets their own (4-6 digits).
export async function setMyCheckinPin(pin: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { error: "No member profile." };

  const clean = (pin || "").trim();
  if (!/^\d{4,6}$/.test(clean)) return { error: "PIN must be 4 to 6 digits." };

  const { resolveActingOrgId } = await import("@/lib/membership");
  const orgId = await resolveActingOrgId(me.id);
  if (!orgId) return { error: "No organization found." };

  const { data: existing } = await supabase
    .from("member_details").select("id").eq("person_id", me.id).eq("org_id", orgId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("member_details").update({ checkin_pin: clean }).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("member_details").insert({ person_id: me.id, org_id: orgId, checkin_pin: clean });
    if (error) return { error: error.message };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function setOrgTimezone(orgId: string, timezone: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_timezone", { p_org_id: orgId, p_timezone: timezone });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

export async function setConflictLeadDays(orgId: string, days: number) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_conflict_lead_days", { p_org_id: orgId, p_days: days });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
