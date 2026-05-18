import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

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
      {/* Header */}
      <div className="border-b border-bone bg-card/50">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 flex items-center justify-between">
          <Link href="/directory" className="text-body-sm text-ash hover:text-brick transition-colors">
            ← All companies
          </Link>
          <Link href="/" className="font-display text-body-lg text-ink hover:text-brick transition-colors">
            Calltime<span className="text-brick">.</span>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
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
