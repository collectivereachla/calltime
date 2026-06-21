import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { getActiveProductionId } from "@/lib/active-production";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const DEPT_ORDER = ["directing", "production", "music", "design", "stage_management", "marketing", "video", "crew"];
const DEPT_LABEL: Record<string, string> = {
  directing: "Direction", production: "Production", music: "Music",
  design: "Design", stage_management: "Stage Management", marketing: "Marketing",
  video: "Video", crew: "Crew",
};

export default async function PlaybillPrintPage({
  searchParams,
}: { searchParams: Promise<{ p?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { personId } = await getViewer(supabase);
  const sp = (await searchParams) || {};
  const pid = (typeof sp.p === "string" ? sp.p : null) || (await getActiveProductionId());
  if (!pid) redirect("/playbill");

  const { data: prod } = await supabase
    .from("productions").select("id, title, org_id").eq("id", pid).maybeSingle();
  if (!prod) redirect("/playbill");

  const { data: playbill } = await supabase
    .from("playbills").select("*").eq("production_id", pid).maybeSingle();
  if (!playbill) redirect("/playbill");

  // Cast: person + characters + headshot + bio.
  const { data: rows } = await supabase
    .from("production_assignments")
    .select("person_id, role_title, department, people!production_assignments_person_id_fkey(full_name, headshot_url, bio)")
    .eq("production_id", pid).eq("active", true);

  type P = { name: string; characters: string[]; headshotPath: string | null; bio: string | null; department: string; roles: string[] };
  const cast = new Map<string, P>();
  const team = new Map<string, P>();
  for (const r of rows || []) {
    const p = r.people as unknown as { full_name: string; headshot_url: string | null; bio: string | null } | null;
    if (!p || /test/i.test(p.full_name)) continue;
    const dept = r.department as string;
    const target = dept === "cast" ? cast : team;
    if (!target.has(r.person_id)) target.set(r.person_id, { name: p.full_name, characters: [], headshotPath: p.headshot_url, bio: p.bio, department: dept, roles: [] });
    const e = target.get(r.person_id)!;
    if (dept === "cast" && r.role_title && !e.characters.includes(r.role_title as string)) e.characters.push(r.role_title as string);
    if (dept !== "cast" && r.role_title && !e.roles.includes(r.role_title as string)) e.roles.push(r.role_title as string);
  }
  const castList = Array.from(cast.values()).sort((a, b) => a.name.localeCompare(b.name));
  const teamList = Array.from(team.values()).sort((a, b) => {
    const da = DEPT_ORDER.indexOf(a.department), db = DEPT_ORDER.indexOf(b.department);
    if (da !== db) return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
    return a.name.localeCompare(b.name);
  });

  // Sign cast headshots.
  const paths = castList.map((c) => c.headshotPath).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: s } = await supabase.storage.from("promo-assets").createSignedUrls(paths, 3600);
    for (const row of s || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }

  const { data: credits } = await supabase
    .from("playbill_credits").select("*").eq("playbill_id", playbill.id).order("sort_order", { ascending: true });
  const sponsors = (credits || []).filter((c) => c.credit_type === "sponsor" || c.credit_type === "partner");
  const ads = (credits || []).filter((c) => c.credit_type === "ad");
  const acks = (credits || []).filter((c) => c.credit_type === "acknowledgment");

  // Sign sponsor/ad logos (also in promo-assets).
  const logoPaths = (credits || []).map((c) => c.image_path).filter((p): p is string => !!p);
  if (logoPaths.length > 0) {
    const { data: ls } = await supabase.storage.from("promo-assets").createSignedUrls(logoPaths, 3600);
    for (const row of ls || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }

  const songList = Array.isArray(playbill.song_scene_list) ? playbill.song_scene_list as { act: string; items: { title: string; detail?: string }[] }[] : [];

  // Group team by department for the credits page.
  const teamByDept = new Map<string, P[]>();
  for (const t of teamList) {
    if (!teamByDept.has(t.department)) teamByDept.set(t.department, []);
    teamByDept.get(t.department)!.push(t);
  }
  const orderedDepts = Array.from(teamByDept.keys()).sort((a, b) => {
    const da = DEPT_ORDER.indexOf(a), db = DEPT_ORDER.indexOf(b);
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
  });

  const title = playbill.cover_title || prod.title;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Toolbar (screen only) */}
      <div className="print:hidden sticky top-0 bg-paper/95 border-b border-bone px-6 py-3 flex items-center justify-between z-10">
        <p className="text-body-sm text-ash">Playbill preview — <span className="font-display italic">{prod.title}</span></p>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto px-10 py-12 print:px-0 print:py-0 print:max-w-none">

        {/* Cover */}
        <section className="text-center py-20 print:py-32 break-after-page">
          <p className="text-body-sm uppercase tracking-[0.3em] text-ash mb-6">Black Theatre Experience presents</p>
          <h1 className="font-display text-5xl leading-tight text-brick mb-4">{title}</h1>
          {playbill.cover_subtitle && <p className="font-display text-xl italic text-ink mb-6">{playbill.cover_subtitle}</p>}
          {playbill.show_info && <p className="text-body-sm text-ash max-w-md mx-auto whitespace-pre-line">{playbill.show_info}</p>}
          {playbill.dedication && <p className="text-body-sm italic text-ash mt-10">{playbill.dedication}</p>}
        </section>

        {/* Director's note */}
        {playbill.directors_note && (
          <section className="mb-12 break-inside-avoid">
            <h2 className="font-display text-2xl text-brick mb-3 border-b border-bone pb-2">Director&rsquo;s Note</h2>
            <div className="text-body-md leading-relaxed whitespace-pre-line">{playbill.directors_note}</div>
          </section>
        )}

        {/* Songs & scenes */}
        {songList.length > 0 && (
          <section className="mb-12 break-inside-avoid">
            <h2 className="font-display text-2xl text-brick mb-3 border-b border-bone pb-2">Musical Numbers &amp; Scenes</h2>
            {songList.map((act, i) => (
              <div key={i} className="mb-4">
                <p className="font-display italic text-lg text-ink mb-1">{act.act}</p>
                <ul className="space-y-0.5">
                  {act.items.map((it, j) => (
                    <li key={j} className="text-body-sm flex justify-between gap-4">
                      <span className="text-ink">{it.title}</span>
                      {it.detail && <span className="text-ash text-right">{it.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Cast */}
        {playbill.include_cast && castList.length > 0 && (
          <section className="mb-12 break-before-page">
            <h2 className="font-display text-2xl text-brick mb-4 border-b border-bone pb-2">Cast</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              {castList.map((c, i) => {
                const url = c.headshotPath ? signed.get(c.headshotPath) || null : null;
                const bio = c.bio && c.bio.trim() ? c.bio.trim() : null;
                return (
                  <div key={i} className="break-inside-avoid flex gap-3">
                    <div className="w-20 shrink-0 aspect-[4/5] rounded-card overflow-hidden bg-bone/40 border border-bone">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-lg font-display text-ash/50">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold leading-tight">{c.name}</p>
                      {c.characters.length > 0 && <p className="text-[11px] text-ash mb-1">{c.characters.join(" / ")}</p>}
                      {bio && <p className="text-body-xs text-ink/90 leading-snug whitespace-pre-line">{bio}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Creative & production team */}
        {playbill.include_creative_team && teamList.length > 0 && (
          <section className="mb-12 break-inside-avoid">
            <h2 className="font-display text-2xl text-brick mb-4 border-b border-bone pb-2">Creative &amp; Production Team</h2>
            <div className="space-y-3">
              {orderedDepts.map((dept) => (
                <div key={dept}>
                  <p className="text-body-xs uppercase tracking-wider text-ash mb-1">{DEPT_LABEL[dept] || dept}</p>
                  {teamByDept.get(dept)!.map((t, i) => (
                    <p key={i} className="text-body-sm flex justify-between gap-4">
                      <span className="text-ash">{t.roles.join(", ")}</span>
                      <span className="text-ink text-right">{t.name}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Special thanks */}
        {playbill.special_thanks && (
          <section className="mb-12 break-inside-avoid">
            <h2 className="font-display text-2xl text-brick mb-3 border-b border-bone pb-2">Special Thanks</h2>
            <div className="text-body-md leading-relaxed whitespace-pre-line">{playbill.special_thanks}</div>
            {acks.length > 0 && (
              <ul className="mt-2 text-body-sm text-ash">
                {acks.map((a) => <li key={a.id}>{a.name}{a.detail ? ` — ${a.detail}` : ""}</li>)}
              </ul>
            )}
          </section>
        )}

        {/* Sponsors & partners */}
        {sponsors.length > 0 && (
          <section className="mb-12 break-inside-avoid">
            <h2 className="font-display text-2xl text-brick mb-3 border-b border-bone pb-2">Our Sponsors &amp; Partners</h2>
            <div className="grid grid-cols-2 gap-4">
              {sponsors.map((s) => {
                const logo = s.image_path ? signed.get(s.image_path) || null : null;
                return (
                  <div key={s.id} className="border border-bone rounded-card p-3 text-center flex flex-col items-center justify-center gap-1.5">
                    {logo && <img src={logo} alt={s.name} className="max-h-16 max-w-full object-contain" />}
                    <p className="font-display text-lg text-ink">{s.name}</p>
                    {s.detail && <p className="text-body-xs text-ash">{s.detail}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Ads */}
        {ads.length > 0 && (
          <section className="break-before-page">
            <h2 className="font-display text-2xl text-brick mb-3 border-b border-bone pb-2">With Support From</h2>
            <div className="grid grid-cols-2 gap-4">
              {ads.map((a) => (
                <div key={a.id} className="border border-bone rounded-card p-4 text-center">
                  <p className="font-display text-lg text-ink">{a.name}</p>
                  {a.detail && <p className="text-body-sm text-ash mt-1">{a.detail}</p>}
                  {a.link_url && <p className="text-body-xs text-brick mt-1">{a.link_url}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
