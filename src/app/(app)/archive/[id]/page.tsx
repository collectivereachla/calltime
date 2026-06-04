import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole, orgIdForProduction } from "@/lib/membership";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArchiveEditor } from "./archive-editor";

export default async function ArchiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase
    .from("people").select("id").eq("id", personId!).single();
  const orgId = await orgIdForProduction(id);
  const role = orgId ? await getRoleInOrg(person!.id, orgId) : null;
  const canManage = isLeadershipRole(role);

  const { data: production } = await supabase
    .from("productions")
    .select("id, title, playwright, venue, status, first_rehearsal, opening_date, closing_date, description, notes, photos, press_links, program_url, has_music, has_choreography")
    .eq("id", id)
    .single();

  if (!production) notFound();

  // Roster
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("id, role_title, department, access_tier, active, people(id, full_name, preferred_name, headshot_url)")
    .eq("production_id", id)
    .order("department", { ascending: true });

  const roster = (assignments || []).map((a) => {
    const p = a.people as unknown as { id: string; full_name: string; preferred_name: string | null; headshot_url: string | null };
    return {
      id: a.id,
      name: p?.preferred_name || p?.full_name || "Unknown",
      fullName: p?.full_name || "Unknown",
      headshot: p?.headshot_url,
      role: a.role_title,
      department: a.department,
      active: a.active,
    };
  });

  // Group by department
  const depts: Record<string, typeof roster> = {};
  for (const r of roster) {
    const dept = r.department || "other";
    if (!depts[dept]) depts[dept] = [];
    depts[dept].push(r);
  }

  const deptOrder = ["cast", "production", "design", "crew", "music", "other"];
  const deptLabels: Record<string, string> = {
    cast: "Cast", production: "Production Team", design: "Design",
    crew: "Crew", music: "Music", other: "Other",
  };

  function formatRange(open: string | null, close: string | null): string {
    if (!open) return "";
    const o = new Date(open + "T00:00:00");
    const c = close ? new Date(close + "T00:00:00") : null;
    const openStr = o.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    if (!c || open === close) return openStr + ", " + o.getFullYear();
    const closeStr = c.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return `${openStr} – ${closeStr}, ${c.getFullYear()}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Link href="/archive" className="text-body-sm text-muted hover:text-ink transition-colors mb-4 inline-block">
        ← Archive
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-display-lg text-ink">{production.title}</h1>
          {production.playwright && (
            <p className="text-body-md text-ash mt-1">by {production.playwright}</p>
          )}
          <p className="text-body-sm text-muted mt-1">
            {formatRange(production.opening_date, production.closing_date)}
            {production.venue && ` · ${production.venue}`}
          </p>
        </div>
        <span className={`text-body-xs px-2 py-0.5 rounded-full shrink-0 ${
          production.status === "closed" ? "bg-bone/30 text-ash" :
          production.status === "rehearsal" ? "bg-tentative/10 text-tentative" :
          production.status === "in_run" ? "bg-confirmed/10 text-confirmed" :
          "bg-bone/30 text-ash"
        }`}>
          {production.status === "pre_production" ? "pre-production" : production.status.replace("_", " ")}
        </span>
      </div>

      {production.description && (
        <p className="text-body-md text-ink leading-relaxed mb-8">{production.description}</p>
      )}

      {/* Roster */}
      <section className="mb-8">
        <h2 className="font-display text-display-sm mb-4">Company</h2>
        {roster.length === 0 ? (
          <p className="text-body-sm text-muted">No company members recorded.</p>
        ) : (
          <div className="space-y-6">
            {deptOrder.filter((d) => depts[d]?.length > 0).map((dept) => (
              <div key={dept}>
                <p className="text-body-xs text-muted uppercase tracking-wider mb-2">{deptLabels[dept] || dept}</p>
                <div className="space-y-1">
                  {depts[dept].map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-1.5">
                      {r.headshot ? (
                        <img src={r.headshot} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-bone flex items-center justify-center text-body-xs text-ash shrink-0">
                          {r.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-body-sm text-ink">{r.fullName}</p>
                        <p className="text-body-xs text-muted">{r.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Press */}
      {Array.isArray(production.press_links) && production.press_links.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-display-sm mb-3">Press</h2>
          <div className="space-y-2">
            {(production.press_links as { title: string; url: string; source?: string }[]).map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                className="block text-body-sm text-brick hover:underline">
                {link.title}{link.source ? ` — ${link.source}` : ""}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Program */}
      {production.program_url && (
        <section className="mb-8">
          <h2 className="font-display text-display-sm mb-3">Program</h2>
          <a href={production.program_url} target="_blank" rel="noopener noreferrer"
            className="text-body-sm text-brick hover:underline">
            View program →
          </a>
        </section>
      )}

      {/* Owner notes */}
      {production.notes && (
        <section className="mb-8">
          <h2 className="font-display text-display-sm mb-3">Notes</h2>
          <p className="text-body-sm text-ash whitespace-pre-wrap">{production.notes}</p>
        </section>
      )}

      {/* Edit section (owners only) */}
      {canManage && (
        <ArchiveEditor
          production={{
            id: production.id,
            title: production.title,
            playwright: production.playwright,
            venue: production.venue,
            status: production.status,
            first_rehearsal: production.first_rehearsal,
            opening_date: production.opening_date,
            closing_date: production.closing_date,
            description: production.description,
            notes: production.notes,
            program_url: production.program_url,
            press_links: (production.press_links as { title: string; url: string; source?: string }[]) || [],
          }}
        />
      )}
    </div>
  );
}
