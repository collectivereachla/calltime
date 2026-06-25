import type { SupabaseClient } from "@supabase/supabase-js";

// people.headshot_url can hold either a promo-assets storage PATH (private
// bucket, must be signed) or a full public URL (e.g. the public `headshots`
// bucket). Older/alternate upload paths wrote different formats into the same
// column, and readers that blindly signed every value against promo-assets
// turned full-URL headshots into broken images. These helpers make every reader
// format-agnostic: a full URL passes through, a path gets signed.

const isFullUrl = (v: string) => /^https?:\/\//i.test(v);

/** Resolve many headshot values → Map keyed by the ORIGINAL value. */
export async function resolveHeadshots(
  supabase: SupabaseClient<any, any, any>,
  values: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (isFullUrl(v)) out.set(v, v);
    else if (!paths.includes(v)) paths.push(v);
  }
  if (paths.length > 0) {
    const { data } = await supabase.storage.from("promo-assets").createSignedUrls(paths, 3600);
    for (const s of data || []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
  }
  return out;
}

/** Resolve a single headshot value → usable <img> src or null. */
export async function resolveHeadshot(
  supabase: SupabaseClient<any, any, any>,
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (isFullUrl(value)) return value;
  const { data } = await supabase.storage.from("promo-assets").createSignedUrl(value, 3600);
  return data?.signedUrl || null;
}
