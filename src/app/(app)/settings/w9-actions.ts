"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Upload (or replace) the member's own signed W-9 into the private bucket and
// record status + year. We never store the SSN itself — only the file and a
// "on file" marker.
export async function submitW9(base64Pdf: string, taxYear: number) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!person) return { error: "We couldn't find your member profile." };
  const { data: membership } = await supabase
    .from("org_memberships").select("org_id").eq("person_id", person.id).limit(1).single();
  if (!membership) return { error: "No organization found." };

  if (!base64Pdf) return { error: "No file received." };
  const year = Number(taxYear);
  if (!year || year < 2020 || year > 2100) return { error: "Pick a valid tax year." };

  const base64 = base64Pdf.includes(",") ? base64Pdf.split(",")[1] : base64Pdf;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength < 500) return { error: "That file looks empty." };
  if (buffer.byteLength > 10 * 1024 * 1024) return { error: "File is too large (max 10 MB)." };

  const path = `${membership.org_id}/${user.id}/w9-${year}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("w9-documents")
    .upload(path, buffer, { upsert: true, contentType: "application/pdf" });
  if (upErr) return { error: upErr.message };

  // Update existing member_details row, or insert one.
  const { data: existing } = await supabase
    .from("member_details").select("id").eq("person_id", person.id).eq("org_id", membership.org_id).maybeSingle();

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
      .insert({ person_id: person.id, org_id: membership.org_id, ...patch })
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
  const { data, error } = await supabase.storage.from("w9-documents").createSignedUrl(path, 120);
  if (error || !data) return { error: error?.message || "Couldn't open the document.", url: null };
  return { error: null, url: data.signedUrl };
}
