import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default async function DirectoryPage() {
  const supabase = await createClient();

  // Fetch all orgs grouped by state
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, city, state, description, logo_url, cover_image_url")
    .order("state")
    .order("name");

  // Group by state
  const byState: Record<string, typeof orgs> = {};
  for (const org of orgs || []) {
    const key = org.state || "Other";
    if (!byState[key]) byState[key] = [];
    byState[key]!.push(org);
  }

  const states = Object.keys(byState).sort();

  return (
    <div className="min-h-screen">
      <PublicHeader />

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="font-display text-display-md mb-2">Companies</h1>
        <p className="text-body-md text-ash mb-10">
          Find a theatre company and see what&apos;s casting.
        </p>

        {states.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-body-md text-muted">No organizations yet.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {states.map((state) => (
              <div key={state}>
                <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">
                  {state}
                </h2>
                <div className="space-y-3">
                  {byState[state]!.map((org) => (
                    <Link
                      key={org.id}
                      href={`/org/${org.slug}`}
                      className="block bg-card border border-bone rounded-card p-5 hover:border-ash transition-colors group"
                    >
                      <div className="flex items-start gap-4">
                        {org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt=""
                            className="w-12 h-12 rounded-card object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-card bg-bone/50 flex items-center justify-center flex-shrink-0">
                            <span className="font-display text-display-sm text-ash">
                              {org.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-body-lg text-ink group-hover:text-brick transition-colors">
                            {org.name}
                          </h3>
                          {org.city && (
                            <p className="text-body-sm text-muted mt-0.5">
                              {org.city}, {org.state}
                            </p>
                          )}
                          {org.description && (
                            <p className="text-body-sm text-ash mt-1.5 line-clamp-2">
                              {org.description}
                            </p>
                          )}
                        </div>
                        <span className="text-muted group-hover:text-brick transition-colors flex-shrink-0 mt-1">
                          →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
