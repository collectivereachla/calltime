import type { SupabaseClient } from "@supabase/supabase-js";
import { PrintButton } from "./print-button";

const DEPT_ORDER = ["directing", "playwright", "production", "music", "design", "stage_management", "marketing", "video", "crew"];
const DEPT_LABEL: Record<string, string> = {
  directing: "Direction", playwright: "Playwright", production: "Production", music: "Music",
  design: "Design", stage_management: "Stage Management", marketing: "Marketing",
  video: "Video", crew: "Crew",
};

function externalHref(url?: string | null): string | null {
  if (!url) return null;
  const t = url.trim();
  if (!t) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  return `https://${t}`;
}
function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

type Prod = { id: string; title: string; org_id: string };
// playbill is the full row; kept loose since columns evolve.
type Playbill = Record<string, unknown> & { id: string };

// Renders the whole program document from live data. `supabase` may be a
// cookie-scoped client (internal preview, RLS) or the admin client (public
// page, no session). `chrome` shows the screen-only print toolbar.
export async function PlaybillBody({
  supabase, pid, prod, playbill, orgName, chrome, accentColor,
}: {
  supabase: SupabaseClient;
  pid: string;
  prod: Prod;
  playbill: Playbill;
  accentColor?: string | null;
  orgName: string;
  chrome: boolean;
}) {
  // Cast + team: person + characters + headshot + bio.
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

  // Director (for the headshot beside the note) — the directing-dept member who directs, not the playwright.
  const director = teamList.find((t) => t.department === "directing" && t.roles.some((r) => /director/i.test(r))) || teamList.find((t) => t.department === "directing" && !t.roles.some((r) => /writer|playwright/i.test(r)));

  // Sign cast + team headshots.
  const paths = [...castList, ...teamList].map((x) => x.headshotPath).filter((p): p is string => !!p);
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
  const gallery = Array.isArray(playbill.gallery_paths) ? playbill.gallery_paths as string[] : [];
  const posterPath = (playbill.poster_path as string) || null;

  // The playwright gets its own section, broken out of the directing department.
  const sectionKey = (t: P) => (t.department === "directing" && t.roles.some((r) => /writer|playwright/i.test(r))) ? "playwright" : t.department;
  const teamByDept = new Map<string, P[]>();
  for (const t of teamList) {
    const k = sectionKey(t);
    if (!teamByDept.has(k)) teamByDept.set(k, []);
    teamByDept.get(k)!.push(t);
  }
  const orderedDepts = Array.from(teamByDept.keys()).sort((a, b) => {
    const da = DEPT_ORDER.indexOf(a), db = DEPT_ORDER.indexOf(b);
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
  });

  const title = (playbill.cover_title as string) || prod.title;

  // Section show/hide + reorder, config-driven (CSS order). Cover + poster stay on top.
  const SECTION_KEYS = ["directors_note","songs_scenes","cast","creative_team","special_thanks","sponsors","ads","gallery"] as const;
  type SectionKey = typeof SECTION_KEYS[number];
  const savedCfg = (Array.isArray(playbill.section_config) ? playbill.section_config : []) as { key: string; visible?: boolean }[];
  const cfg = savedCfg.filter((c) => (SECTION_KEYS as readonly string[]).includes(c.key));
  const orderedKeys: string[] = cfg.length ? cfg.map((c) => c.key) : [...SECTION_KEYS];
  for (const k of SECTION_KEYS) if (!orderedKeys.includes(k)) orderedKeys.push(k);
  const orderIndex = (k: string) => { const i = orderedKeys.indexOf(k); return i < 0 ? 99 : i + 1; };
  const isVisible = (k: string): boolean => {
    const c = cfg.find((x) => x.key === k);
    if (c) return c.visible !== false;
    if (k === "cast") return playbill.include_cast as boolean;
    if (k === "creative_team") return playbill.include_creative_team as boolean;
    return true;
  };
  const customSections = (Array.isArray(playbill.custom_sections) ? playbill.custom_sections : []) as { id: string; title?: string; body?: string }[];
  const accentStyle = accentColor ? { color: accentColor } : undefined;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {chrome && (
        <div className="print:hidden sticky top-0 bg-paper/95 border-b border-bone px-6 py-3 flex items-center justify-between z-10">
          <p className="text-body-sm text-ash">Playbill preview — <span className="font-display italic">{prod.title}</span></p>
          <PrintButton />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-10 py-12 print:px-0 print:py-0 print:max-w-none flex flex-col">

        {/* Flyer / poster */}
        {posterPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterPath} alt={`${title} poster`} className="w-full max-w-xl mx-auto rounded-card mb-10 print:mb-6" />
        )}

        {/* Cover */}
        <section className="text-center py-20 print:py-32 break-after-page">
          {((playbill.presented_by as string) || orgName) && (
            <p className="text-body-sm uppercase tracking-[0.3em] text-ash mb-6">
              {(playbill.presented_by as string) || `${orgName} presents`}
            </p>
          )}
          <h1 style={accentStyle} className="font-display text-5xl leading-tight text-brick mb-4">{title}</h1>
          {(playbill.cover_subtitle as string) && <p className="font-display text-xl italic text-ink mb-6">{playbill.cover_subtitle as string}</p>}
          {(playbill.show_info as string) && <p className="text-body-sm text-ash max-w-md mx-auto whitespace-pre-line">{playbill.show_info as string}</p>}
          {(playbill.dedication as string) && <p className="text-body-sm italic text-ash mt-10">{playbill.dedication as string}</p>}
        </section>

        {/* Director's note */}
        {isVisible("directors_note") && (playbill.directors_note as string) && (
          <section className="mb-12 break-inside-avoid" style={{ order: orderIndex("directors_note") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Director&rsquo;s Note</h2>
            <div className="font-display text-body-md leading-relaxed whitespace-pre-line">
              {director?.headshotPath && signed.get(director.headshotPath) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.get(director.headshotPath)!} alt={director.name} className="float-left w-32 h-40 mr-5 mb-3 rounded-card object-cover border border-bone" />
              )}
              {playbill.directors_note as string}
            </div>
          </section>
        )}

        {/* Songs & scenes */}
        {isVisible("songs_scenes") && songList.length > 0 && (
          <section className="mb-12 break-inside-avoid" style={{ order: orderIndex("songs_scenes") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Musical Numbers &amp; Scenes</h2>
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
        {isVisible("cast") && castList.length > 0 && (
          <section className="mb-12 break-before-page" style={{ order: orderIndex("cast") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Cast</h2>
            <div className="columns-1 sm:columns-2 gap-x-10">
              {castList.map((c, i) => {
                const url = c.headshotPath ? signed.get(c.headshotPath) || null : null;
                const bio = c.bio && c.bio.trim() ? c.bio.trim() : null;
                return (
                  <div key={i} className="break-inside-avoid flex gap-3 mb-5">
                    <div className="w-24 h-32 shrink-0 self-start rounded-card overflow-hidden bg-bone/40 border border-bone">
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
                      {bio && <p className="font-display text-base text-ink/90 leading-relaxed whitespace-pre-line">{bio}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Creative & production team */}
        {isVisible("creative_team") && teamList.length > 0 && (
          <section className="mb-12 break-inside-avoid" style={{ order: orderIndex("creative_team") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Creative &amp; Production Team</h2>
            <div className="space-y-6">
              {orderedDepts.map((dept) => (
                <div key={dept} className="break-inside-avoid">
                  <p className="text-body-xs uppercase tracking-wider text-ash mb-2">{DEPT_LABEL[dept] || dept}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-6">
                    {teamByDept.get(dept)!.map((t, i) => {
                      const url = t.headshotPath ? signed.get(t.headshotPath) || null : null;
                      return (
                        <div key={i} className="text-center">
                          <div className="w-24 h-32 mx-auto mb-2 rounded-card overflow-hidden bg-bone/40 border border-bone">
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={t.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-xl font-display text-ash/50">{t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-body-sm font-medium leading-tight">{t.name}</p>
                          {dept !== "playwright" && <p className="text-[11px] text-ash leading-tight mt-0.5">{t.roles.join(", ")}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Special thanks */}
        {isVisible("special_thanks") && (playbill.special_thanks as string) && (
          <section className="mb-12 break-inside-avoid" style={{ order: orderIndex("special_thanks") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Special Thanks</h2>
            <div className="font-display text-body-md leading-relaxed whitespace-pre-line">{playbill.special_thanks as string}</div>
            {acks.length > 0 && (
              <ul className="mt-2 text-body-sm text-ash">
                {acks.map((a) => <li key={a.id}>{a.name}{a.detail ? ` — ${a.detail}` : ""}</li>)}
              </ul>
            )}
          </section>
        )}

        {/* Sponsors & partners */}
        {isVisible("sponsors") && sponsors.length > 0 && (
          <section className="mb-12 break-inside-avoid" style={{ order: orderIndex("sponsors") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Our Sponsors &amp; Partners</h2>
            <div className="grid grid-cols-2 gap-4">
              {sponsors.map((s) => {
                const logo = s.image_path ? signed.get(s.image_path) || null : null;
                const href = externalHref(s.link_url);
                const card = (
                  <div className="border border-bone rounded-card p-3 text-center flex flex-col items-center justify-center gap-1.5 h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {logo && <img src={logo} alt={s.name} className="max-h-16 max-w-full object-contain" />}
                    <p className="font-display text-lg text-ink">{s.name}</p>
                    {s.detail && <p className="text-body-xs text-ash">{s.detail}</p>}
                  </div>
                );
                return href ? (
                  <a key={s.id} href={href} target="_blank" rel="noopener noreferrer" className="block no-underline transition-opacity hover:opacity-80">{card}</a>
                ) : (
                  <div key={s.id}>{card}</div>
                );
              })}
            </div>
          </section>
        )}

        {/* Ads */}
        {isVisible("ads") && ads.length > 0 && (
          <section className="break-before-page" style={{ order: orderIndex("ads") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">With Support From</h2>
            <div className="grid grid-cols-2 gap-4">
              {ads.map((a) => {
                const href = externalHref(a.link_url);
                return (
                  <div key={a.id} className="border border-bone rounded-card p-4 text-center">
                    <p className="font-display text-lg text-ink">{a.name}</p>
                    {a.detail && <p className="text-body-sm text-ash mt-1">{a.detail}</p>}
                    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-body-xs text-brick mt-1 inline-block hover:underline break-all">{displayUrl(a.link_url!)}</a>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {/* Gallery */}
        {isVisible("gallery") && gallery.length > 0 && (
          <section className="mb-12 break-before-page" style={{ order: orderIndex("gallery") }}>
            <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">Gallery</h2>
            <div className="columns-2 md:columns-3 gap-3">
              {gallery.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`${title} — photo ${i + 1}`} className="w-full mb-3 rounded-card border border-bone break-inside-avoid" />
              ))}
            </div>
          </section>
        )}

        {/* Custom sections (org-authored), ordered + toggled like the built-ins */}
        {customSections.map((cs) => (
          isVisible("custom:" + cs.id) && (cs.body && cs.body.trim()) ? (
            <section key={cs.id} className="mb-12 break-inside-avoid" style={{ order: orderIndex("custom:" + cs.id) }}>
              {cs.title && cs.title.trim() && (
                <h2 style={accentStyle} className="font-display text-lg uppercase tracking-[0.18em] text-brick text-center mb-5 pb-2 border-b border-bone">{cs.title}</h2>
              )}
              <div className="font-display text-body-md leading-relaxed whitespace-pre-line">{cs.body}</div>
            </section>
          ) : null
        ))}
      </div>
    </div>
  );
}
