import { createClient } from "@/lib/supabase/server";
import { resolveHeadshots } from "@/lib/headshot";
import { getViewer } from "@/lib/viewer";
import { getRoleInOrg, isLeadershipRole, resolveActingOrgId, canLeadOrgShows } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";
import { MarqueeRoom } from "./marquee-room";
import { ProductionPicker } from "./production-picker";

export default async function MarqueePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("id", personId!).single();

  const orgId = await resolveActingOrgId(person!.id);

  if (!orgId) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const role = await getRoleInOrg(person!.id, orgId);
  const canManage = isLeadershipRole(role) || (await canLeadOrgShows(person!.id, orgId));

  // The productions this person can see, in the same set/order the rest of the
  // app uses (so Marquee matches the production they're working in everywhere
  // else). Marquees stay per-production; we never auto-jump between them.
  const ACTIVE_STATUSES = ["pre_production", "rehearsal", "tech", "in_run"];
  let myProductions: { id: string; title: string }[] = [];
  if (isLeadershipRole(role)) {
    const { data } = await supabase
      .from("productions")
      .select("id, title")
      .eq("org_id", orgId)
      .in("status", ACTIVE_STATUSES)
      .order("opening_date", { ascending: true, nullsFirst: false });
    myProductions = data || [];
  } else {
    const { data } = await supabase
      .from("production_assignments")
      .select("productions!inner(id, title, status, opening_date)")
      .eq("person_id", person!.id)
      .eq("active", true)
      .in("productions.status", ACTIVE_STATUSES);
    const seen = new Set<string>();
    myProductions = (data || [])
      .map((a) => a.productions as unknown as { id: string; title: string; opening_date: string | null })
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .sort((a, b) => (a.opening_date || "9999").localeCompare(b.opening_date || "9999"))
      .map((p) => ({ id: p.id, title: p.title }));
  }

  // Which production's Marquee to show: an explicit in-room pick (?p=) wins, then
  // the production already active app-wide, then the person's first production.
  // No automatic switching to a different show.
  const isValid = (id?: string | null) => !!id && myProductions.some((p) => p.id === id);
  const sp = (await searchParams) || {};
  const requested = typeof sp.p === "string" ? sp.p : null;
  const cookiePid = await getActiveProductionId();
  const pid =
    (isValid(requested) ? requested : null) ||
    (isValid(cookiePid) ? cookiePid : null) ||
    myProductions[0]?.id ||
    null;

  // Leadership (can approve/demote others' uploads): org owner/production/admin,
  // or a designer / SM / director / production-tier assignment on this show.
  let canApprove = isLeadershipRole(role) || (await canLeadOrgShows(person!.id, orgId));
  if (!canApprove && pid) {
    const { data: pa } = await supabase
      .from("production_assignments")
      .select("access_tier, department")
      .eq("person_id", person!.id)
      .eq("production_id", pid)
      .eq("active", true);
    canApprove = (pa || []).some(
      (a) =>
        ["admin", "production", "staff"].includes(a.access_tier) ||
        ["design", "stage_management", "direction"].includes(a.department)
    );
  }

  let prodTitle = "";
  type Person = { id: string; name: string };
  type Asset = {
    id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
    caption: string | null; created_at: string; uploaded_by: string | null; file_path: string;
    uploaderName: string; isImage: boolean; previewUrl: string | null; isOfficial: boolean;
    isVideo: boolean; category: string; durationSeconds: number | null; tagged: Person[];
  };
  let assets: Asset[] = [];
  const roster: Person[] = [];
  type HeadshotRow = {
    personId: string; name: string; roleTitle: string | null;
    department: string | null; headshotPath: string | null; previewUrl: string | null;
  };
  const headshots: HeadshotRow[] = [];
  type CoverageRow = { id: string; kind: string; title: string; outlet: string | null; published_date: string | null; url: string | null; pull_quote: string | null };
  let coverage: CoverageRow[] = [];

  if (pid) {
    const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).single();
    prodTitle = prod?.title || "";

    const { data: covRows } = await supabase
      .from("press_coverage")
      .select("id, kind, title, outlet, published_date, url, pull_quote")
      .eq("production_id", pid)
      .order("published_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    coverage = (covRows || []) as CoverageRow[];

    const { data: rows } = await supabase
      .from("promo_assets")
      .select("id, file_name, mime_type, size_bytes, caption, created_at, uploaded_by, file_path, is_official, category, duration_seconds, people!promo_assets_uploaded_by_fkey(full_name, preferred_name)")
      .eq("production_id", pid)
      .order("created_at", { ascending: false });

    const list = rows || [];
    const mediaPaths = list
      .filter((r) => (r.mime_type || "").startsWith("image/") || (r.mime_type || "").startsWith("video/"))
      .map((r) => r.file_path);
    const signed = new Map<string, string>();
    if (mediaPaths.length > 0) {
      const { data: signedList } = await supabase.storage.from("promo-assets").createSignedUrls(mediaPaths, 3600);
      for (const s of signedList || []) {
        if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
      }
    }

    // Tags per asset + the roster of people who can be tagged.
    const assetIds = list.map((r) => r.id);
    const tagsByAsset = new Map<string, Person[]>();
    if (assetIds.length > 0) {
      const { data: tagRows } = await supabase
        .from("promo_asset_tags")
        .select("asset_id, person_id, people(full_name, preferred_name)")
        .in("asset_id", assetIds);
      for (const t of tagRows || []) {
        const pp = t.people as unknown as { full_name: string; preferred_name: string | null } | null;
        const arr = tagsByAsset.get(t.asset_id) || [];
        arr.push({ id: t.person_id, name: pp ? pp.preferred_name || pp.full_name : "—" });
        tagsByAsset.set(t.asset_id, arr);
      }
    }

    const { data: rosterRows } = await supabase
      .from("production_assignments")
      .select("person_id, role_title, department, people(full_name, preferred_name, headshot_url)")
      .eq("production_id", pid)
      .eq("active", true);
    const seen = new Set<string>();
    const headshotPaths: string[] = [];
    for (const a of rosterRows || []) {
      if (seen.has(a.person_id)) continue;
      seen.add(a.person_id);
      const pp = a.people as unknown as { full_name: string; preferred_name: string | null; headshot_url: string | null } | null;
      if (pp?.headshot_url) headshotPaths.push(pp.headshot_url);
      roster.push({ id: a.person_id, name: pp ? pp.preferred_name || pp.full_name : "—" });
    }
    roster.sort((a, b) => a.name.localeCompare(b.name));

    // Build the headshot roster grid: one row per person, signed preview if they
    // have a headshot on their person record. Headshots live on people.headshot_url
    // (portable across orgs/shows), stored as a promo-assets path.
    const headSigned = await resolveHeadshots(supabase, headshotPaths);
    const seenH = new Set<string>();
    for (const a of rosterRows || []) {
      if (seenH.has(a.person_id)) continue;
      seenH.add(a.person_id);
      const pp = a.people as unknown as { full_name: string; preferred_name: string | null; headshot_url: string | null } | null;
      headshots.push({
        personId: a.person_id,
        name: pp ? pp.preferred_name || pp.full_name : "—",
        roleTitle: (a.role_title as string) || null,
        department: (a.department as string) || null,
        headshotPath: pp?.headshot_url || null,
        previewUrl: pp?.headshot_url ? headSigned.get(pp.headshot_url) || null : null,
      });
    }
    headshots.sort((a, b) => a.name.localeCompare(b.name));

    assets = list.map((r) => {
      const p = r.people as unknown as { full_name: string; preferred_name: string | null } | null;
      const isImage = (r.mime_type || "").startsWith("image/");
      const isVideo = (r.mime_type || "").startsWith("video/");
      return {
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        caption: r.caption,
        created_at: r.created_at,
        uploaded_by: r.uploaded_by,
        file_path: r.file_path,
        uploaderName: p ? p.preferred_name || p.full_name : "—",
        isImage,
        isVideo,
        previewUrl: isImage || isVideo ? signed.get(r.file_path) || null : null,
        isOfficial: !!r.is_official,
        category: r.category || "other",
        durationSeconds: r.duration_seconds,
        tagged: tagsByAsset.get(r.id) || [],
      };
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-lg text-ink mb-1">Marquee</h1>
      <p className="text-body-sm text-ash mb-4">
        Shared promo photos and flyers{prodTitle ? ` for ${prodTitle}` : ""}. Everyone can upload and download the originals.
      </p>

      {myProductions.length > 1 && pid && (
        <div className="mb-6">
          <ProductionPicker productions={myProductions} selected={pid} />
        </div>
      )}

      {!pid ? (
        <p className="text-body-md text-ash">Select a production to see its promo materials.</p>
      ) : (
        <MarqueeRoom
          productionId={pid}
          orgId={orgId}
          myPersonId={person!.id}
          canManage={canManage}
          canApprove={canApprove}
          assets={assets}
          roster={roster}
          headshots={headshots}
          coverage={coverage}
        />
      )}
    </div>
  );
}
