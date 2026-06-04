"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface PayerFields {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
}

function cleanPayer(f: PayerFields) {
  return {
    name: f.name.trim(),
    contact_name: f.contactName?.trim() || null,
    email: f.email?.trim() || null,
    phone: f.phone?.trim() || null,
    address: f.address?.trim() || null,
  };
}

export async function createPayer(orgId: string, f: PayerFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.name?.trim()) return { error: "A payer name is required." };
  const { data, error } = await supabase
    .from("payers")
    .insert({ org_id: orgId, ...cleanPayer(f) })
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't create the payer — you may not have permission." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function updatePayer(payerId: string, f: PayerFields) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!f.name?.trim()) return { error: "A payer name is required." };
  const { data, error } = await supabase
    .from("payers")
    .update(cleanPayer(f))
    .eq("id", payerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "The change didn't save." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function setProductionDefaultPayer(productionId: string, payerId: string | null) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productions")
    .update({ default_payer_id: payerId })
    .eq("id", productionId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't set the default payer — you may not have permission." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function setContractPayer(contractId: string, payerId: string | null) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({ payer_id: payerId })
    .eq("id", contractId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't set the payer for this contract." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function addPaymentMethod(
  orgId: string,
  productionId: string | null,
  method: string,
  label: string
) {
  await assertNotPreviewing();
  const supabase = await createClient();
  if (!method?.trim()) return { error: "A method is required." };
  const { data, error } = await supabase
    .from("payment_method_options")
    .insert({
      org_id: orgId,
      production_id: productionId,
      method: method.trim().toLowerCase().replace(/\s+/g, ""),
      label: label?.trim() || method.trim(),
      enabled: true,
      sort_order: 50,
    })
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't add the method — you may not have permission." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function togglePaymentMethod(id: string, enabled: boolean) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_method_options")
    .update({ enabled })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "The change didn't save." };
  revalidatePath("/ledger");
  return { error: null };
}

export async function deletePaymentMethod(id: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_method_options")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't remove the method." };
  revalidatePath("/ledger");
  return { error: null };
}
