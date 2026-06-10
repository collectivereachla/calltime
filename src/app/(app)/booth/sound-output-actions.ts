"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface OutputFields {
  outputNumber: string;
  destination: string | null;
  source: string | null;
  connection: string;
  outputType: string;
  isBackup: boolean;
  notes: string | null;
}

function clean(f: OutputFields) {
  return {
    output_number: f.outputNumber.trim(),
    destination: f.destination?.trim() || null,
    source: f.source?.trim() || null,
    connection: ["wired", "wireless"].includes(f.connection) ? f.connection : "wired",
    output_type: ["speaker", "wedge", "iem", "feed", "other"].includes(f.outputType) ? f.outputType : "wedge",
    is_backup: !!f.isBackup,
    notes: f.notes?.trim() || null,
  };
}

export async function createSoundOutput(productionId: string, f: OutputFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.outputNumber?.trim()) return { error: "An output number or label is required." };

  const { data, error } = await supabase
    .from("sound_outputs")
    .insert({ production_id: productionId, ...clean(f) })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't save — you may not have permission to manage sound outputs." };
  }
  revalidatePath("/booth");
  return { error: null, id: data[0].id };
}

export async function updateSoundOutput(outputId: string, f: OutputFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.outputNumber?.trim()) return { error: "An output number or label is required." };

  const { data, error } = await supabase
    .from("sound_outputs")
    .update(clean(f))
    .eq("id", outputId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The change didn't save. You may not have permission, or your session expired — refresh and try again." };
  }
  revalidatePath("/booth");
  return { error: null };
}

export async function deleteSoundOutput(outputId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sound_outputs")
    .delete()
    .eq("id", outputId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't delete — you may not have permission." };
  }
  revalidatePath("/booth");
  return { error: null };
}
