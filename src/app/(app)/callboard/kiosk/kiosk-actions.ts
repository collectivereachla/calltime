"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Kiosk check-in: a person taps their name on the SM's device and enters their
// PIN. We verify the PIN server-side against member_details for the event's
// org, then stamp the event_call. The acting user (the SM/leadership running
// the kiosk) is recorded as checked_in_by. This is the only check-in path —
// there is no self-check-in from a personal device.

async function assertKioskOperator(eventCallId: string) {
  // The person operating the kiosk must have production permissions in the
  // event's org. We verify via the logged-in session, then do the write with
  // the admin client so PIN lookups across the roster aren't hidden by RLS.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { ok: false as const, error: "No member profile." };

  const admin = createAdminClient();
  const { data: call } = await admin
    .from("event_calls")
    .select("id, person_id, event_id, schedule_events!inner ( org_id )")
    .eq("id", eventCallId)
    .maybeSingle();
  if (!call) return { ok: false as const, error: "Call not found." };
  const orgId = (call.schedule_events as unknown as { org_id: string }).org_id;

  const { data: mem } = await admin
    .from("org_memberships")
    .select("role")
    .eq("person_id", me.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!mem || !["owner", "production", "admin"].includes(mem.role as string)) {
    return { ok: false as const, error: "You don't have permission to run check-in for this production." };
  }
  return { ok: true as const, operatorId: me.id, call, orgId, admin };
}

export async function checkInWithPin(eventCallId: string, pin: string) {
  const guard = await assertKioskOperator(eventCallId);
  if (!guard.ok) return { error: guard.error };
  const { operatorId, call, orgId, admin } = guard;

  const entered = (pin || "").trim();
  if (!entered) return { error: "Enter your PIN." };

  const { data: md } = await admin
    .from("member_details")
    .select("checkin_pin")
    .eq("person_id", call.person_id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!md?.checkin_pin) {
    return { error: "No PIN set for this person. The stage manager can set one." };
  }
  if (md.checkin_pin !== entered) {
    return { error: "That PIN doesn't match." };
  }

  const { data: updated, error } = await admin
    .from("event_calls")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: operatorId })
    .eq("id", eventCallId)
    .is("checked_in_at", null)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    // Already checked in — treat as success, idempotent.
    return { error: null, alreadyIn: true };
  }
  revalidatePath("/callboard/kiosk");
  return { error: null };
}

// Leadership can undo a check-in (mistap) without a PIN.
export async function undoCheckIn(eventCallId: string) {
  const guard = await assertKioskOperator(eventCallId);
  if (!guard.ok) return { error: guard.error };
  const { admin } = guard;
  const { error } = await admin
    .from("event_calls")
    .update({ checked_in_at: null, checked_in_by: null })
    .eq("id", eventCallId);
  if (error) return { error: error.message };
  revalidatePath("/callboard/kiosk");
  return { error: null };
}

// Leadership can set or change a person's PIN from the kiosk roster.
export async function setCheckinPin(personId: string, orgId: string, pin: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { error: "No member profile." };

  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", orgId).maybeSingle();
  if (!mem || !["owner", "production", "admin"].includes(mem.role as string)) {
    return { error: "You don't have permission." };
  }

  const clean = (pin || "").trim();
  if (!/^\d{4,6}$/.test(clean)) return { error: "PIN must be 4 to 6 digits." };

  // Upsert the PIN onto the per-org member_details row.
  const { data: existing } = await admin
    .from("member_details").select("id").eq("person_id", personId).eq("org_id", orgId).maybeSingle();
  if (existing) {
    const { error } = await admin.from("member_details").update({ checkin_pin: clean }).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("member_details").insert({ person_id: personId, org_id: orgId, checkin_pin: clean });
    if (error) return { error: error.message };
  }
  revalidatePath("/callboard/kiosk");
  return { error: null };
}
