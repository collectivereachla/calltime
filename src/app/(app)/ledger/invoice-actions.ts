"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCompensationAmount } from "./invoice-utils";

export async function submitInvoice(input: {
  contractId: string;
  paymentMethod: string;
  paymentDetails: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  // Load the contract and its production (contracts have no org_id of their own).
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, person_id, production_id, status, compensation, payer_id")
    .eq("id", input.contractId)
    .single();
  if (!contract) return { error: "Contract not found." };

  if (contract.person_id !== me.id) {
    return { error: "You can only submit an invoice for your own contract." };
  }
  if (contract.status !== "countersigned") {
    return { error: "An invoice can't be generated until your contract is fully signed." };
  }

  const baseAmount = parseCompensationAmount(contract.compensation);
  if (baseAmount === null) {
    return { error: "Your contract doesn't list a payable dollar amount, so no invoice can be generated." };
  }

  const { data: production } = await supabase
    .from("productions")
    .select("id, org_id, default_payer_id")
    .eq("id", contract.production_id)
    .single();
  if (!production) return { error: "Production not found." };

  // Resolve Bill-To: the contract's payer overrides the production default.
  const payerId = contract.payer_id || production.default_payer_id || null;

  // W9 threshold (org setting, default $600). At/above it, a W-9 must be on file.
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", production.org_id)
    .single();
  const threshold = Number((org?.settings as Record<string, unknown> | null)?.w9_threshold ?? 600);
  const w9Required = baseAmount >= threshold;

  if (w9Required) {
    const { data: md } = await supabase
      .from("member_details")
      .select("w9_submitted, w9_tax_year")
      .eq("person_id", me.id)
      .eq("org_id", production.org_id)
      .maybeSingle();
    const currentYear = new Date().getFullYear();
    const w9Current = !!md?.w9_submitted && Number(md?.w9_tax_year) >= currentYear;
    if (!w9Current) {
      return {
        error: `Payments of $${threshold.toLocaleString()} or more need a current (${currentYear}) W-9 on file before an invoice can be submitted. Please add your W-9 first.`,
        needsW9: true,
      };
    }
  }

  // One active invoice per contract.
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("contract_id", contract.id)
    .neq("status", "void");
  if (existing && existing.length > 0) {
    return { error: "You've already submitted an invoice for this contract." };
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      org_id: production.org_id,
      production_id: contract.production_id,
      person_id: me.id,
      contract_id: contract.id,
      payer_id: payerId,
      base_amount: baseAmount,
      payment_method: input.paymentMethod || null,
      payment_details: input.paymentDetails?.trim() || null,
      w9_required: w9Required,
      status: "submitted",
    })
    .select("id")
    .single();

  if (invErr) return { error: invErr.message };
  if (!inv) {
    return { error: "The invoice didn't save. Refresh and try again, or contact your manager." };
  }

  const { error: lineErr } = await supabase.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: "Contracted fee",
    amount: baseAmount,
    is_base: true,
    sort_order: 0,
  });
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/ledger");
  return { error: null };
}

// ---- Finance management (owner/production only; enforced by RLS) ----

export async function addInvoiceLine(invoiceId: string, description: string, amount: number) {
  const supabase = await createClient();
  if (!description?.trim()) return { error: "A description is required." };
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data, error } = await supabase
    .from("invoice_line_items")
    .insert({ invoice_id: invoiceId, description: description.trim(), amount, is_base: false, sort_order: 100 })
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't add the line — you may not have permission." };

  revalidatePath("/ledger");
  return { error: null };
}

export async function deleteInvoiceLine(lineId: string) {
  const supabase = await createClient();
  // The locked base line can't be removed here.
  const { data, error } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", lineId)
    .eq("is_base", false)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't remove the line." };

  revalidatePath("/ledger");
  return { error: null };
}

export async function setInvoiceStatus(invoiceId: string, status: string) {
  const supabase = await createClient();
  if (!["submitted", "approved", "paid", "void"].includes(status)) return { error: "Invalid status." };

  const patch: Record<string, unknown> = { status };
  patch.approved_at = status === "approved" || status === "paid" ? new Date().toISOString() : null;
  patch.paid_at = status === "paid" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't update the invoice — you may not have permission." };

  revalidatePath("/ledger");
  return { error: null };
}
