"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCompensationAmount } from "./invoice-utils";

export async function submitInvoice(input: {
  contractId: string;
  paymentMethod: string;
  paymentDetails: string;
  payeeAddress: string;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, email, phone")
    .eq("user_id", user.id)
    .single();
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

  const payeeAddress = input.payeeAddress?.trim() || null;

  // A member has at most one live invoice per production. If a reimbursement-only
  // invoice was already opened for them (approved receipts, no contract behind it),
  // upgrade it in place instead of creating a second one. If a contract invoice
  // already exists, they've submitted.
  const { data: existing } = await supabase
    .from("invoices")
    .select("id, contract_id")
    .eq("production_id", contract.production_id)
    .eq("person_id", me.id)
    .neq("status", "void")
    .maybeSingle();

  let invoiceId: string;

  if (existing) {
    if (existing.contract_id) {
      return { error: "You've already submitted an invoice for this production." };
    }
    // Members have no RLS UPDATE on invoices, so a direct update silently no-ops.
    // Upgrade the reimbursement-only invoice in place via a SECURITY DEFINER RPC
    // that re-checks ownership + that the contract is the caller's and countersigned.
    const { error: upgErr } = await supabase.rpc("upgrade_member_invoice", {
      p_invoice_id: existing.id,
      p_contract_id: contract.id,
      p_payer_id: payerId,
      p_base: baseAmount,
      p_method: input.paymentMethod || "",
      p_details: input.paymentDetails || "",
      p_w9: w9Required,
      p_payee_name: me.preferred_name || me.full_name,
      p_payee_address: payeeAddress || "",
      p_payee_email: me.email || "",
      p_payee_phone: me.phone || "",
    });
    if (upgErr) return { error: upgErr.message };
    invoiceId = existing.id;
  } else {
    // Invoice number: atomic, org-scoped counter (SECURITY DEFINER RPC).
    // A client-side count() is wrong here — RLS only shows the member their own
    // invoice, so the count was always 0 and every invoice collided on
    // INV-{year}-0001. next_invoice_number increments a per-org/year counter
    // server-side and is race-safe.
    const { data: invoiceNumber, error: numErr } = await supabase
      .rpc("next_invoice_number", { p_org: production.org_id });
    if (numErr || !invoiceNumber) {
      return { error: "Couldn't assign an invoice number. Refresh and try again, or reach out to production." };
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
        invoice_number: invoiceNumber,
        payee_name: me.preferred_name || me.full_name,
        payee_address: payeeAddress,
        payee_email: me.email,
        payee_phone: me.phone,
      })
      .select("id")
      .single();

    if (invErr) return { error: invErr.message };
    if (!inv) {
      return { error: "The invoice didn't save. Refresh and try again, or reach out to production." };
    }
    invoiceId = inv.id;
  }

  // Remember the mailing address on the member's profile for next time.
  if (payeeAddress) {
    const { data: mdRow } = await supabase
      .from("member_details").select("id").eq("person_id", me.id).eq("org_id", production.org_id).maybeSingle();
    if (mdRow) {
      await supabase.from("member_details").update({ mailing_address: payeeAddress }).eq("id", mdRow.id);
    } else {
      await supabase.from("member_details").insert({ person_id: me.id, org_id: production.org_id, mailing_address: payeeAddress });
    }
  }

  const { error: lineErr } = await supabase.from("invoice_line_items").insert({
    invoice_id: invoiceId,
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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
  await assertNotPreviewing();
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


export async function donateContractPayment(input: { contractId: string }) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, email, phone")
    .eq("user_id", user.id)
    .single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, person_id, production_id, status, compensation, payer_id")
    .eq("id", input.contractId)
    .single();
  if (!contract) return { error: "Contract not found." };
  if (contract.person_id !== me.id) return { error: "You can only act on your own contract." };
  if (contract.status !== "countersigned") return { error: "Your contract isn't fully signed yet." };

  const baseAmount = parseCompensationAmount(contract.compensation);
  if (baseAmount === null) return { error: "Your contract doesn't list a payable amount to donate." };

  const { data: production } = await supabase
    .from("productions")
    .select("id, org_id, default_payer_id")
    .eq("id", contract.production_id)
    .single();
  if (!production) return { error: "Production not found." };
  const payerId = contract.payer_id || production.default_payer_id || null;

  // One live invoice per member per production: don't let a donation collide with a submission.
  const { data: existing } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("production_id", contract.production_id)
    .eq("person_id", me.id)
    .neq("status", "void")
    .maybeSingle();
  if (existing) return { error: "You've already submitted or donated for this production." };

  const { data: invoiceNumber, error: numErr } = await supabase.rpc("next_invoice_number", { p_org: production.org_id });
  if (numErr || !invoiceNumber) return { error: "Couldn't record the donation. Refresh and try again." };

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      org_id: production.org_id,
      production_id: contract.production_id,
      person_id: me.id,
      contract_id: contract.id,
      payer_id: payerId,
      base_amount: baseAmount,
      payment_method: null,
      payment_details: null,
      w9_required: false,
      status: "donated",
      invoice_number: invoiceNumber,
      payee_name: me.preferred_name || me.full_name,
      payee_address: null,
      payee_email: me.email,
      payee_phone: me.phone,
    })
    .select("id")
    .single();
  if (invErr) return { error: invErr.message };
  if (!inv) return { error: "The donation didn't save. Refresh and try again." };

  await supabase.from("invoice_line_items").insert({
    invoice_id: inv.id,
    description: "Payment donated to Black Theatre Experience & the SWLA Juneteenth Committee",
    amount: baseAmount,
    is_base: true,
    sort_order: 0,
  });

  revalidatePath("/ledger");
  return { success: true };
}


export async function updateInvoicePayment(input: { invoiceId: string; paymentMethod: string; paymentDetails: string }) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!me) return { error: "We couldn't find your member profile." };

  const { data: inv } = await supabase.from("invoices").select("id, person_id, status").eq("id", input.invoiceId).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.person_id !== me.id) return { error: "You can only update your own invoice." };
  if (inv.status !== "submitted") return { error: "This invoice can no longer be edited." };

  // Members have no RLS UPDATE on invoices (only owner/production do), so a direct
  // update silently affects 0 rows. Go through a SECURITY DEFINER RPC that re-checks
  // ownership + submitted status and updates only the payment columns.
  const { error } = await supabase.rpc("update_invoice_payment", {
    p_invoice_id: input.invoiceId,
    p_method: input.paymentMethod || "",
    p_details: input.paymentDetails || "",
  });
  if (error) return { error: error.message };

  revalidatePath("/ledger");
  return { success: true };
}
