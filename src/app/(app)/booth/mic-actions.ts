"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface MicFields {
  packNumber: string;
  channel: string | null;
  element: string | null;
  isBackup: boolean;
  notes: string | null;
  inputType: string;
  connection: string;
}

function clean(f: MicFields) {
  return {
    pack_number: f.packNumber.trim(),
    channel: f.channel?.trim() || null,
    element: f.element?.trim() || null,
    is_backup: !!f.isBackup,
    notes: f.notes?.trim() || null,
    input_type: ["lav", "handheld", "instrument", "other"].includes(f.inputType) ? f.inputType : "lav",
    connection: ["wireless", "di", "wired"].includes(f.connection) ? f.connection : "wireless",
  };
}

export async function createMic(productionId: string, f: MicFields) {
  const supabase = await createClient();
  if (!f.packNumber?.trim()) return { error: "A pack number or label is required." };

  const { data, error } = await supabase
    .from("wireless_mics")
    .insert({ production_id: productionId, ...clean(f) })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't save — you may not have permission to manage the mic plot." };
  }
  revalidatePath("/booth");
  return { error: null, id: data[0].id };
}

export async function updateMic(micId: string, f: MicFields) {
  const supabase = await createClient();
  if (!f.packNumber?.trim()) return { error: "A pack number or label is required." };

  const { data, error } = await supabase
    .from("wireless_mics")
    .update(clean(f))
    .eq("id", micId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The change didn't save. You may not have permission, or your session expired — refresh and try again." };
  }
  revalidatePath("/booth");
  revalidatePath("/dressing-room");
  return { error: null };
}

export async function deleteMic(micId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wireless_mics")
    .delete()
    .eq("id", micId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't delete — you may not have permission." };
  }
  revalidatePath("/booth");
  revalidatePath("/dressing-room");
  return { error: null };
}

// Set which actors are on a given mic. An actor wears one mic at a time, so
// selecting an actor here also clears them off any other mic in this production.
export async function setMicAssignees(micId: string, productionId: string, personIds: string[]) {
  const supabase = await createClient();

  // Clear this mic's current actors.
  const { error: delErr } = await supabase
    .from("mic_assignments")
    .delete()
    .eq("mic_id", micId);
  if (delErr) return { error: delErr.message };

  if (personIds.length > 0) {
    // Clear the selected actors off any other mic in this production.
    const { error: clearErr } = await supabase
      .from("mic_assignments")
      .delete()
      .eq("production_id", productionId)
      .in("person_id", personIds);
    if (clearErr) return { error: clearErr.message };

    const rows = personIds.map((pid) => ({
      mic_id: micId,
      person_id: pid,
      production_id: productionId,
    }));
    const { data, error } = await supabase
      .from("mic_assignments")
      .insert(rows)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return {
        error:
          "The change didn't save. You may not have permission, or your session expired — refresh the page and try again.",
      };
    }
  }

  revalidatePath("/booth");
  revalidatePath("/dressing-room");
  return { error: null };
}
