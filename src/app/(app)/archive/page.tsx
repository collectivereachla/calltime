import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isOwnerRole, resolveActingOrgId } from "@/lib/membership";
import Link from "next/link";

export default async function ArchivePage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase
    .from("people").select("id").eq("id", personId!).single();
  const orgId = await resolveActingOrgId(person!.id);

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="font-display text-display-md mb-2">Archive</h1>
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const role = await getRoleInOrg(person!.id, orgId);
  const isOwner = isOwnerRole(role);

  const { data: productions } = await supabase
    .from("productions")
    .select("id, title, playwright, venue, status, first_rehearsal, opening_date, closing_date, description, photos")
    .eq("org_id", orgId)
    .order("opening_date", { ascending: false });

  // Get cast counts per production
  const prodIds = (productions || []).map((p) => p.id);
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("production_id, id")
    .in("production_id", prodIds.length > 0 ? prodIds : ["none"]);

  const castCounts: Record<string, number> = {};
  for (const a of assignments || []) {
    castCounts[a.production_id] = (castCounts[a.production_id] || 0) + 1;
  }

  const closed = (productions || []).filter((p) => p.status === "closed");
  const active = (productions || []).filter((p) => p.status !== "closed");

  function formatDate(d: string | null): string {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", year: "numeric",
    });
  }

  function formatRange(open: string | null, close: string | null): string {
    if (!open) return "";
    const o = new Date(open + "T00:00:00");
    const c = close ? new Date(close + "T00:00:00") : null;
    const openStr = o.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!c || open === close) return openStr + ", " + o.getFullYear();
    const closeStr = c.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${openStr}–${closeStr}, ${c.getFullYear()}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-lg text-ink mb-1">Archive</h1>
      <p className="text-body-sm text-ash mb-8">
        Every production. The company&apos;s history.
      </p>

      {/* Active / Upcoming */}
      {active.length > 0 && (
        <div className="mb-10">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-3">Current &amp; Upcoming</p>
          <div className="space-y-2">
            {active.map((p) => (
              <Link key={p.id} href={`/archive/${p.id}`}
                className="flex items-center justify-between bg-card border border-bone rounded-card px-5 py-4 hover:border-ash transition-colors">
                <div>
                  <p className="font-display text-body-lg text-ink">{p.title}</p>
                  <p className="text-body-sm text-ash mt-0.5">
                    {p.playwright && `${p.playwright} · `}
                    {formatRange(p.opening_date, p.closing_date)}
                    {p.venue && ` · ${p.venue}`}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className={`text-body-xs px-2 py-0.5 rounded-full ${
                    p.status === "rehearsal" ? "bg-tentative/10 text-tentative" :
                    p.status === "in_run" ? "bg-confirmed/10 text-confirmed" :
                    "bg-bone/30 text-ash"
                  }`}>
                    {p.status === "pre_production" ? "pre-production" : p.status.replace("_", " ")}
                  </span>
                  <p className="text-body-xs text-muted mt-1">{castCounts[p.id] || 0} people</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Closed / Historical */}
      <div>
        <p className="text-body-xs text-muted uppercase tracking-wider mb-3">Past Productions</p>
        {closed.length === 0 ? (
          <p className="text-body-sm text-muted py-4">No past productions yet.</p>
        ) : (
          <div className="space-y-2">
            {closed.map((p) => {
              const photoCount = Array.isArray(p.photos) ? p.photos.length : 0;
              return (
                <Link key={p.id} href={`/archive/${p.id}`}
                  className="flex items-center justify-between bg-card border border-bone rounded-card px-5 py-4 hover:border-ash transition-colors">
                  <div>
                    <p className="font-display text-body-lg text-ink">{p.title}</p>
                    <p className="text-body-sm text-ash mt-0.5">
                      {p.playwright && `${p.playwright} · `}
                      {formatRange(p.opening_date, p.closing_date)}
                      {p.venue && ` · ${p.venue}`}
                    </p>
                    {p.description && (
                      <p className="text-body-xs text-muted mt-1 line-clamp-1">{p.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-body-xs text-muted">{castCounts[p.id] || 0} people</p>
                    {photoCount > 0 && <p className="text-body-xs text-muted">{photoCount} photos</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Add production */}
      {isOwner && (
        <div className="mt-8 pt-6 border-t border-bone">
          <p className="text-body-sm text-ash">
            Add a past production to the archive?{" "}
            <Link href="/archive/new" className="text-brick hover:underline">
              Create production record →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
