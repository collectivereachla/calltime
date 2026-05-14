import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CalendarLink } from "@/components/calendar-link";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get person record
  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, calendar_token")
    .eq("user_id", user!.id)
    .single();

  // Get all production assignments for this person
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select(`
      id,
      role_title,
      department,
      access_tier,
      active,
      productions (
        id,
        title,
        playwright,
        venue,
        status,
        first_rehearsal,
        opening_date,
        closing_date,
        organizations (
          id,
          name
        )
      )
    `)
    .eq("person_id", person!.id)
    .eq("active", true);

  const displayName = person?.preferred_name || person?.full_name || "there";

  // Deduplicate by production — aggregate role titles for multi-role people
  type ProdInfo = {
    id: string; title: string; status: string;
    playwright: string | null; venue: string | null;
    first_rehearsal: string | null; opening_date: string | null;
    closing_date: string | null; organizations: { id: string; name: string };
  };

  const prodMap = new Map<string, {
    assignment_id: string;
    role_titles: string[];
    productions: ProdInfo;
  }>();

  for (const a of assignments || []) {
    const prod = a.productions as unknown as ProdInfo;
    if (prod.status === "archived" || prod.status === "closed") continue;
    const existing = prodMap.get(prod.id);
    if (existing) {
      existing.role_titles.push(a.role_title);
    } else {
      prodMap.set(prod.id, {
        assignment_id: a.id,
        role_titles: [a.role_title],
        productions: prod,
      });
    }
  }

  const activeProductions = Array.from(prodMap.values())
    .sort((a, b) => (a.productions.opening_date || "").localeCompare(b.productions.opening_date || ""));

  // Check if user can create productions
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", person!.id);

  const canCreate = memberships?.some(
    (m) => m.role === "owner" || m.role === "production"
  );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Page header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-display text-display-md text-ink">
            {displayName}
          </h1>
          <p className="text-body-md text-ash mt-1">
            {activeProductions.length === 0
              ? "No active productions."
              : `${activeProductions.length} active production${activeProductions.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canCreate && (
          <a
            href="/home/new-production"
            className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors shrink-0"
          >
            New production
          </a>
        )}
      </div>

      {/* Productions */}
      {activeProductions.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">
            When you&rsquo;re assigned to a production, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeProductions.map((entry) => {
            const prod = entry.productions;
            return (
              <Link
                href={`/productions/${prod.id}`}
                key={prod.id}
                className="block bg-card border border-bone rounded-card px-6 py-5 hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-display-sm text-ink">
                      {prod.title}
                    </h2>
                    {prod.playwright && (
                      <p className="text-body-sm text-ash mt-0.5">
                        by {prod.playwright}
                      </p>
                    )}
                    <p className="text-body-sm text-ash mt-1">
                      {prod.organizations.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block text-body-xs font-medium px-2 py-0.5 rounded-full bg-brick/10 text-brick">
                      {entry.role_titles.join(" / ")}
                    </span>
                    <p className="text-body-xs text-muted mt-1.5 font-mono">
                      {prod.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {(prod.first_rehearsal || prod.opening_date) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-bone">
                    {prod.first_rehearsal && (
                      <div>
                        <p className="text-body-xs text-muted">First rehearsal</p>
                        <p className="font-mono text-data-sm text-ink">
                          {new Date(prod.first_rehearsal + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                    {prod.opening_date && (
                      <div>
                        <p className="text-body-xs text-muted">Opening</p>
                        <p className="font-mono text-data-sm text-ink">
                          {new Date(prod.opening_date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Calendar subscription */}
      {person?.calendar_token && (
        <div className="mt-10 pt-6 border-t border-bone">
          <CalendarLink token={person.calendar_token} />
        </div>
      )}
    </div>
  );
}
