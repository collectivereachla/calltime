"use server";

import { createClient } from "@/lib/supabase/server";
import { assertNotPreviewing } from "@/lib/viewer";

// Writes are authorized by RLS (leadership of the production's org). These
// actions just perform the write; preview mode is hard-blocked.

const TABLE_FIELDS = ["number", "name", "capacity", "x", "y", "amount", "source", "status"];
const GUEST_FIELDS = ["name", "party_size", "amount", "source", "status", "table_id", "notes"];

const TABLE_COLS = "id, number, name, capacity, x, y, amount, source, status";
const GUEST_COLS = "id, name, party_size, amount, source, status, table_id, notes, checked_in";

export async function addSeatingTable(productionId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("seating_tables")
    .select("number")
    .eq("production_id", productionId);
  const rows = existing || [];
  const nextNum = rows.reduce((m, t) => Math.max(m, Number(t.number) || 0), 0) + 1;
  const idx = rows.length;
  const x = 40 + (idx % 4) * 150;
  const y = 60 + Math.floor(idx / 4) * 155;
  const { data, error } = await supabase
    .from("seating_tables")
    .insert({ production_id: productionId, number: nextNum, capacity: 8, x, y, amount: 400, status: "Paid" })
    .select(TABLE_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeatingTable(id: string, patch: Record<string, unknown>) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const clean: Record<string, unknown> = {};
  for (const k of TABLE_FIELDS) if (k in patch) clean[k] = patch[k];
  if ("capacity" in clean) clean.capacity = Number(clean.capacity) || 1;
  if ("number" in clean) clean.number = Number(clean.number) || 1;
  if ("name" in clean) clean.name = (clean.name as string)?.trim() || null;
  if ("amount" in clean) {
    const a = clean.amount;
    clean.amount = a === "" || a == null ? null : Number(a);
  }
  if ("source" in clean) clean.source = (clean.source as string) || null;
  const { error } = await supabase.from("seating_tables").update(clean).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeSeatingTable(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_tables").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addSeatingGuest(
  productionId: string,
  tableId: string | null,
  name: string,
  partySize: number
) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_guests")
    .insert({
      production_id: productionId,
      name: (name || "").trim(),
      party_size: Number(partySize) || 1,
      status: tableId ? "Paid" : "Unpaid",
      table_id: tableId,
      notes: tableId ? "Added at table" : "",
    })
    .select(GUEST_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeatingGuest(id: string, patch: Record<string, unknown>) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const clean: Record<string, unknown> = {};
  for (const k of GUEST_FIELDS) if (k in patch) clean[k] = patch[k];
  if ("party_size" in clean) clean.party_size = Number(clean.party_size) || 1;
  if ("amount" in clean) {
    const a = clean.amount;
    clean.amount = a === "" || a == null ? null : Number(a);
  }
  if ("table_id" in clean) clean.table_id = clean.table_id === "" ? null : clean.table_id;
  const { error } = await supabase.from("seating_guests").update(clean).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setGuestCheckedIn(id: string, value: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_guests")
    .update({ checked_in: value, checked_in_at: value ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeSeatingGuest(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_guests").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setSeatingPrice(productionId: string, price: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const val = price === "" || price == null ? null : Number(price);
  const { error } = await supabase
    .from("seating_settings")
    .upsert(
      { production_id: productionId, price_per_seat: val, updated_at: new Date().toISOString() },
      { onConflict: "production_id" }
    );
  if (error) throw new Error(error.message);
}
