"use server";
import { assertNotPreviewing } from "@/lib/viewer";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";
import { headers } from "next/headers";
import { generateW9Pdf, type W9Fields } from "@/lib/w9-pdf";

// Upload (or replace) the member's own signed W-9 into the private bucket and
// record status + year. We never store the SSN itself — only the file and a
// "on file" marker.
export async function submitW9(base64Pdf: string, taxYear: number) {
  await assertNotPreviewing();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { error: "We couldn't find your member profile." };
  // W-9 is per-org. Tie it to the org of the show the member is working in
  // (or their sole org if unambiguous), never an arbitrary membership.
  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) return { error: "Open the production this W-9 is for, then try again." };

  if (!base64Pdf) return { error: "No file received." };
  const year = Number(taxYear);
  if (!year || year < 2020 || year > 2100) return { error: "Pick a valid tax year." };

  const base64 = base64Pdf.includes(",") ? base64Pdf.split(",")[1] : base64Pdf;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength < 500) return { error: "That file looks empty." };
  if (buffer.byteLength > 10 * 1024 * 1024) return { error: "File is too large (max 10 MB)." };

  const path = `${orgId}/${user.id}/w9-${year}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("w9-documents")
    .upload(path, buffer, { upsert: true, contentType: "application/pdf" });
  if (upErr) return { error: upErr.message };

  // Update existing member_details row, or insert one.
  const { data: existing } = await supabase
    .from("member_details").select("id").eq("person_id", person.id).eq("org_id", orgId).maybeSingle();

  const patch = {
    w9_submitted: true,
    w9_submitted_at: new Date().toISOString(),
    w9_tax_year: year,
    w9_document_path: path,
  };

  if (existing) {
    const { error } = await supabase.from("member_details").update(patch).eq("id", existing.id).select("id");
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("member_details")
      .insert({ person_id: person.id, org_id: orgId, ...patch })
      .select("id");
    if (error) return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/ledger");
  revalidatePath("/company");
  return { error: null, year };
}

// Short-lived signed URL for viewing a stored W-9. Storage RLS restricts this to
// the owner of the file or finance for that org, so a normal member can't pull
// someone else's.
export async function getW9SignedUrl(path: string) {
  const supabase = await createClient();
  if (!path) return { error: "No document on file.", url: null };
  const { data, error } = await supabase.storage.from("w9-documents").createSignedUrl(path, 3600);
  if (error || !data) return { error: error?.message || "Couldn't open the document.", url: null };
  return { error: null, url: data.signedUrl };
}


// Fill out a W-9 ON Calltime: generate a substitute Form W-9 PDF from the
// member's entries + e-signature, store it in the same private bucket as an
// uploaded W-9. The SSN/EIN is embedded ONLY in the generated PDF (private
// bucket, RLS-restricted to the owner + finance); it is never stored in a DB
// column.
export async function fileW9(input: {
  name: string;
  businessName?: string;
  classification: string;
  llcCode?: string;
  otherText?: string;
  exemptPayeeCode?: string;
  fatcaCode?: string;
  address: string;
  cityStateZip: string;
  accountNumbers?: string;
  tinType: "ssn" | "ein";
  tin: string;
  signatureName: string;
  signatureImage?: string | null;
  taxYear: number;
  certified: boolean;
}) {
  await assertNotPreviewing();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { error: "We couldn't find your member profile." };
  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) return { error: "Open the production this W-9 is for, then try again." };

  // Validate
  if (!input.certified) return { error: "You must check the certification box to sign." };
  if (!input.name?.trim()) return { error: "Name (line 1) is required." };
  if (!input.classification) return { error: "Choose a federal tax classification." };
  if (!input.address?.trim() || !input.cityStateZip?.trim()) return { error: "Address (lines 5 and 6) is required." };
  if (!input.signatureName?.trim()) return { error: "Type your name to sign." };
  const tinDigits = (input.tin || "").replace(/\D/g, "");
  const need = input.tinType === "ssn" ? 9 : 9;
  if (tinDigits.length !== need) return { error: `Enter a valid ${input.tinType === "ssn" ? "9-digit SSN" : "9-digit EIN"}.` };
  const year = Number(input.taxYear);
  if (!year || year < 2020 || year > 2100) return { error: "Pick a valid tax year." };

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const signedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const fields: W9Fields = {
    name: input.name.trim(),
    businessName: input.businessName?.trim() || undefined,
    classification: input.classification,
    llcCode: input.llcCode?.trim() || undefined,
    otherText: input.otherText?.trim() || undefined,
    exemptPayeeCode: input.exemptPayeeCode?.trim() || undefined,
    fatcaCode: input.fatcaCode?.trim() || undefined,
    address: input.address.trim(),
    cityStateZip: input.cityStateZip.trim(),
    accountNumbers: input.accountNumbers?.trim() || undefined,
    tinType: input.tinType,
    tin: tinDigits,
    signatureName: input.signatureName.trim(),
    signatureImage: input.signatureImage || null,
    signedDate,
    orgName: org?.name || "",
    signerIp: ip,
  };

  let bytes: Uint8Array;
  try {
    bytes = await generateW9Pdf(fields);
  } catch (e) {
    return { error: `Couldn't generate the W-9: ${(e as Error).message}` };
  }

  const path = `${orgId}/${user.id}/w9-${year}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("w9-documents")
    .upload(path, Buffer.from(bytes), { upsert: true, contentType: "application/pdf" });
  if (upErr) return { error: upErr.message };

  const { data: existing } = await supabase
    .from("member_details").select("id").eq("person_id", person.id).eq("org_id", orgId).maybeSingle();
  const patch = { w9_submitted: true, w9_submitted_at: new Date().toISOString(), w9_tax_year: year, w9_document_path: path };
  if (existing) {
    const { error } = await supabase.from("member_details").update(patch).eq("id", existing.id).select("id");
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("member_details").insert({ person_id: person.id, org_id: orgId, ...patch }).select("id");
    if (error) return { error: error.message };
  }

  revalidatePath("/settings"); revalidatePath("/ledger"); revalidatePath("/company");
  return { error: null, year };
}
