import type { SupabaseClient } from "@supabase/supabase-js";

// people.headshot_url holds either a promo-assets storage PATH (private bucket,
// must be signed) or a full public URL. A full URL passes through; a path gets
// signed. We also ask Supabase Storage to return a DISPLAY-SIZED, modern-format
// (WebP/AVIF) render instead of the multi-MB original — same crispness where the
// image is shown, a fraction of the bytes. Pass `width` for the context (avatars
// ~128, cards/rosters 400 default, a large profile view 600-800). Full URLs
// can't be transformed (we only have the served URL, not the path) so they pass
// through unchanged.

const isFullUrl = (v: string) => /^https?:\/\//i.test(v);
const DEFAULT_WIDTH = 400;
const DEFAULT_QUALITY = 72;

type Opts = { width?: number; quality?: number };

/** Resolve many headshot values → Map keyed by the ORIGINAL value. */
export async function resolveHeadshots(
  supabase: SupabaseClient<any, any, any>,
  values: (string | null | undefined)[],
  opts: Opts = {}
): Promise<Map<string, string>> {
  const width = opts.width ?? DEFAULT_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (isFullUrl(v)) out.set(v, v);
    else if (!paths.includes(v)) paths.push(v);
  }
  // createSignedUrls (batch) has no transform option, so sign each path with a
  // transform individually. Counts are small (a roster), so this is fine.
  await Promise.all(
    paths.map(async (p) => {
      const { data } = await supabase.storage
        .from("promo-assets")
        .createSignedUrl(p, 3600, { transform: { width, quality, resize: "contain" } });
      if (data?.signedUrl) out.set(p, data.signedUrl);
    })
  );
  return out;
}

/** Resolve a single headshot value → usable <img> src or null. */
export async function resolveHeadshot(
  supabase: SupabaseClient<any, any, any>,
  value: string | null | undefined,
  opts: Opts = {}
): Promise<string | null> {
  if (!value) return null;
  if (isFullUrl(value)) return value;
  const width = opts.width ?? DEFAULT_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const { data } = await supabase.storage
    .from("promo-assets")
    .createSignedUrl(value, 3600, { transform: { width, quality, resize: "contain" } });
  return data?.signedUrl || null;
}
