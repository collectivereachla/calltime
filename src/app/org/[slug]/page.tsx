import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Fetch org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, city, state, description, logo_url, cover_image_url, website")
    .eq("slug", slug)
    .single();

  if (!org) notFound();

  // Fetch public productions for this org
  const { data: productions } = await supabase
    .from("productions")
    .select("id, title, playwright, venue, status, opening_date, closing_date, first_rehearsal, accepting_applications, application_types, open_call_description, open_call_deadline, has_music, has_choreography")
    .eq("org_id", org.id)
    .eq("visibility", "public")
    .order("opening_date", { ascending: true, nullsFirst: false });

  const openCall = (productions || []).filter((p) => p.accepting_applications);
  const upcoming = (productions || []).filter((p) => !p.accepting_applications && p.status !== "closed");
  const past = (productions || []).filter((p) => p.status === "closed");

  // Public gallery: only APPROVED (is_official) image assets, only on PUBLIC
  // productions. Read via the admin client (controlled, read-only) and serve
  // signed URLs — the promo-assets bucket is private, so unapproved or
  // private-show material is never exposed. Consent/approval is the gate.
  const publicProdIds = (productions || []).map((p) => p.id);
  let gallery: { id: string; url: string; caption: string | null; production_title: string | null }[] = [];
  if (publicProdIds.length > 0) {
    const admin = createAdminClient();
    const { data: assets } = await admin
      .from("promo_assets")
      .select("id, file_path, caption, mime_type, production_id, is_official")
      .in("production_id", publicProdIds)
      .eq("is_official", true)
      .order("created_at", { ascending: false })
      .limit(24);
    const images = (assets || []).filter((a) => (a.mime_type || "").startsWith("image/"));
    if (images.length > 0) {
      const titleByProd = new Map(publicProdIds.map((id) => {
        const pr = (productions || []).find((p) => p.id === id);
        return [id, pr?.title || null] as const;
      }));
      const { data: signed } = await admin.storage
        .from("promo-assets")
        .createSignedUrls(images.map((a) => a.file_path), 3600);
      const urlByPath = new Map((signed || []).map((s) => [s.path, s.signedUrl] as const));
      gallery = images
        .map((a) => ({
          id: a.id,
          url: urlByPath.get(a.file_path) || "",
          caption: a.caption,
          production_title: titleByProd.get(a.production_id) || null,
        }))
        .filter((g) => g.url);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return null;
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-screen">
      <PublicHeader back={{ href: "/directory", label: "All companies" }} />

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Cover image */}
        {org.cover_image_url && (
          <div className="rounded-card overflow-hidden mb-6 aspect-[3/1] bg-bone/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={org.cover_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Org header */}
        <div className="flex items-start gap-5 mb-8">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="w-16 h-16 rounded-card object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-card bg-bone/50 flex items-center justify-center flex-shrink-0">
              <span className="font-display text-display-md text-ash">{org.name.charAt(0)}</span>
            </div>
          )}
          <div>
            <h1 className="font-display text-display-md">{org.name}</h1>
            {org.city && (
              <p className="text-body-md text-muted mt-0.5">{org.city}, {org.state}</p>
            )}
            {org.description && (
              <p className="text-body-md text-ash mt-2">{org.description}</p>
            )}
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body-sm text-brick hover:underline mt-2 inline-block"
              >
                {org.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>

        {/* Open call section */}
        {openCall.length > 0 && (
          <div className="mb-12">
            <h2 className="font-display text-body-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-confirmed inline-block" />
              Open call
            </h2>
            <div className="space-y-4">
              {openCall.map((prod) => (
                <div
                  key={prod.id}
                  className="bg-card border border-bone rounded-card p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-body-lg text-ink">{prod.title}</h3>
                      {prod.playwright && (
                        <p className="text-body-sm text-ash mt-0.5">by {prod.playwright}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-body-sm text-muted">
                        {prod.venue && <span>{prod.venue}</span>}
                        {prod.opening_date && <span>Opens {formatDate(prod.opening_date)}</span>}
                        {prod.first_rehearsal && <span>Rehearsals begin {formatDate(prod.first_rehearsal)}</span>}
                      </div>
                      {prod.open_call_description && (
                        <p className="text-body-sm text-ash mt-3">{prod.open_call_description}</p>
                      )}
                      {/* Tags */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(prod.application_types as string[] || []).map((type: string) => (
                          <span
                            key={type}
                            className="text-body-xs px-2 py-0.5 rounded-full bg-bone/50 text-ash capitalize"
                          >
                            {type}
                          </span>
                        ))}
                        {prod.has_music && (
                          <span className="text-body-xs px-2 py-0.5 rounded-full bg-bone/50 text-ash">Musical</span>
                        )}
                        {prod.has_choreography && (
                          <span className="text-body-xs px-2 py-0.5 rounded-full bg-bone/50 text-ash">Choreography</span>
                        )}
                      </div>
                      {prod.open_call_deadline && (
                        <p className="text-body-xs text-tentative mt-3">
                          Deadline: {formatDate(prod.open_call_deadline)}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/org/${slug}/apply/${prod.id}`}
                      className="flex-shrink-0 px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors"
                    >
                      Apply
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery — approved work, the company's visual proof */}
        {gallery.length > 0 && (
          <div className="mb-12">
            <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">Gallery</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {gallery.map((g) => (
                <figure key={g.id} className="group relative overflow-hidden rounded-card bg-bone/30 aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.url}
                    alt={g.caption || g.production_title || ""}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {(g.caption || g.production_title) && (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {g.caption && <span className="block text-body-xs text-paper">{g.caption}</span>}
                      {g.production_title && <span className="block text-body-xs text-paper/70 font-display italic">{g.production_title}</span>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming productions */}
        {upcoming.length > 0 && (
          <div className="mb-12">
            <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">Upcoming</h2>
            <div className="space-y-3">
              {upcoming.map((prod) => (
                <div key={prod.id} className="bg-card border border-bone rounded-card p-4">
                  <h3 className="font-display text-body-md text-ink">{prod.title}</h3>
                  {prod.playwright && <p className="text-body-sm text-ash">by {prod.playwright}</p>}
                  <div className="flex gap-4 mt-1 text-body-xs text-muted">
                    {prod.venue && <span>{prod.venue}</span>}
                    {prod.opening_date && <span>Opens {formatDate(prod.opening_date)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past productions */}
        {past.length > 0 && (
          <div>
            <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">Past productions</h2>
            <div className="space-y-2">
              {past.map((prod) => (
                <div key={prod.id} className="flex items-baseline justify-between py-2 border-b border-bone/50 last:border-0">
                  <div>
                    <span className="text-body-md text-ink">{prod.title}</span>
                    {prod.playwright && <span className="text-body-sm text-muted ml-2">by {prod.playwright}</span>}
                  </div>
                  {prod.opening_date && (
                    <span className="text-body-xs text-muted">{new Date(prod.opening_date + "T00:00:00").getFullYear()}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {(productions || []).length === 0 && (
          <div className="text-center py-16">
            <p className="text-body-md text-muted">No productions listed yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
