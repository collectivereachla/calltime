import { createClient } from "@/lib/supabase/server";
import { resolveHeadshots } from "@/lib/headshot";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getViewer } from "@/lib/viewer";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["pre_production", "rehearsal", "tech", "in_run"];

export default async function CastListPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { personId } = await getViewer(supabase);
  const sp = (await searchParams) || {};
  const requested = typeof sp.p === "string" ? sp.p : null;

  // Resolve the production: an explicit ?p= wins, then the active cookie if
  // valid, otherwise the person's most relevant active production. Don't bounce
  // just because the cookie is empty.
  let pid = requested || (await getActiveProductionId());
  const { data: visible } = await supabase
    .from("production_assignments")
    .select("production_id, productions!inner(id, status, opening_date)")
    .eq("person_id", personId!)
    .eq("active", true)
    .in("productions.status", ACTIVE_STATUSES);
  const validIds = new Set((visible || []).map((v) => v.production_id as string));
  if (!pid || !validIds.has(pid)) {
    const sorted = (visible || [])
      .map((v) => v.productions as unknown as { id: string; opening_date: string | null })
      .sort((a, b) => (a.opening_date || "9999").localeCompare(b.opening_date || "9999"));
    pid = sorted[0]?.id || null;
  }
  if (!pid) redirect("/company");

  const { data: prod } = await supabase
    .from("productions")
    .select("title")
    .eq("id", pid)
    .maybeSingle();
  if (!prod) redirect("/company");

  // Cast only, with character (role_title) and headshot. One row per person,
  // even if they double-cast (combine their characters).
  const { data: rows } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, people!production_assignments_person_id_fkey(full_name, preferred_name, headshot_url)")
    .eq("production_id", pid)
    .eq("department", "cast")
    .eq("active", true);

  type Entry = { name: string; characters: string[]; headshotPath: string | null };
  const byPerson = new Map<string, Entry>();
  for (const r of rows || []) {
    const p = r.people as unknown as { full_name: string; preferred_name: string | null; headshot_url: string | null } | null;
    if (!p) continue;
    const name = p.full_name;
    if (!byPerson.has(r.person_id)) {
      byPerson.set(r.person_id, { name, characters: [], headshotPath: p.headshot_url });
    }
    const e = byPerson.get(r.person_id)!;
    if (r.role_title && !e.characters.includes(r.role_title as string)) e.characters.push(r.role_title as string);
  }

  const entries = Array.from(byPerson.values())
    .filter((e) => !/test/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Sign all headshots in one batch.
  const signed = await resolveHeadshots(
    supabase,
    entries.map((e) => e.headshotPath)
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-8 py-10 print:px-0 print:py-0">
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <h1 className="text-3xl font-display uppercase tracking-wide text-brick">{prod.title}</h1>
            <p className="text-body-md text-ash mt-1 uppercase tracking-widest">Cast</p>
          </div>
          <PrintButton />
        </div>

        {entries.length === 0 ? (
          <p className="text-body-md text-ash">No cast assigned yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-7 print:grid-cols-4 print:gap-x-4 print:gap-y-5">
            {entries.map((e, i) => {
              const url = e.headshotPath ? signed.get(e.headshotPath) || null : null;
              return (
                <div key={i} className="break-inside-avoid text-center">
                  <div className="aspect-[4/5] w-full rounded-card overflow-hidden bg-bone/40 border border-bone mb-2">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={e.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-2xl font-display text-ash/50">
                          {e.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-body-sm font-semibold leading-tight">{e.name}</p>
                  <p className="text-body-xs text-ash leading-tight">{e.characters.join(" / ") || "\u00A0"}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
