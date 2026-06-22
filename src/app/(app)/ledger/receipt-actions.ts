"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";

const MAX_BYTES = 10 * 1024 * 1024;

// A company member submits a receipt against a show they're working. It lands as
// "pending" — a member-entered dollar amount never touches an invoice until finance
// approves it.
export async function submitReceipt(input: {
  base64File: string;
  contentType: string;
  amount: number;
  description: string;
  category: string;
  expenseDate: string;
  productionId: string;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { error: "We couldn't find your member profile." };

  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) return { error: "Open the production this receipt is for, then try again." };

  const amount = Number(input.amount);
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  const description = input.description?.trim();
  if (!description) return { error: "Add a short note of what this was for." };

  // The production must belong to the acting org, and the member must be on its roster.
  const { data: prod } = await supabase
    .from("productions").select("id, org_id").eq("id", input.productionId).maybeSingle();
  if (!prod || prod.org_id !== orgId) return { error: "That production isn't in your current organization." };

  const { data: pa } = await supabase
    .from("production_assignments")
    .select("id")
    .eq("production_id", input.productionId)
    .eq("person_id", person.id)
    .eq("active", true)
    .maybeSingle();
  if (!pa) return { error: "You're not on the active roster for this production." };

  // The receipt image/PDF is optional but encouraged.
  let path: string | null = null;
  if (input.base64File) {
    const base64 = input.base64File.includes(",") ? input.base64File.split(",")[1] : input.base64File;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength < 200) return { error: "That file looks empty." };
    if (buffer.byteLength > MAX_BYTES) return { error: "File is too large (max 10 MB)." };
    const ct = input.contentType || "application/octet-stream";
    const ext = ct.includes("pdf") ? "pdf"
      : ct.includes("png") ? "png"
      : ct.includes("webp") ? "webp"
      : ct.includes("heic") ? "heic"
      : "jpg";
    path = `${orgId}/${user.id}/${input.productionId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("receipts")
      .upload(path, buffer, { upsert: false, contentType: ct });
    if (upErr) return { error: upErr.message };
  }

  const { error } = await supabase.from("expense_receipts").insert({
    production_id: input.productionId,
    org_id: orgId,
    person_id: person.id,
    description,
    category: input.category?.trim() || null,
    amount,
    expense_date: input.expenseDate || null,
    receipt_path: path,
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidatePath("/ledger");
  return { error: null };
}

// Short-lived signed URL for viewing a stored receipt. Storage RLS restricts this to
// the submitter or finance for that org.
export async function getReceiptSignedUrl(path: string) {
  const supabase = await createClient();
  if (!path) return { error: "No receipt file on this one.", url: null };
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 120);
  if (error || !data) return { error: error?.message || "Couldn't open the receipt.", url: null };
  return { error: null, url: data.signedUrl };
}

// Finance approves or rejects. Approve attaches the amount to the member's invoice
// (opening a reimbursement-only invoice if they have none yet) via the RPC.
export async function reviewReceipt(receiptId: string, decision: "approve" | "reject", note: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_expense_receipt", {
    p_receipt_id: receiptId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  const res = data as { error: string | null } | null;
  if (res?.error) return { error: res.error };
  revalidatePath("/ledger");
  return { error: null };
}

// A member may withdraw their own still-pending receipt (RLS enforces this).
export async function deleteReceipt(receiptId: string) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("expense_receipts").select("receipt_path").eq("id", receiptId).maybeSingle();
  const { data, error } = await supabase.from("expense_receipts").delete().eq("id", receiptId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't remove that receipt." };
  if (rec?.receipt_path) {
    await supabase.storage.from("receipts").remove([rec.receipt_path]);
  }
  revalidatePath("/ledger");
  return { error: null };
}
