import { createClient } from "@/lib/supabase/server";
import { getActiveProductionId } from "@/lib/active-production";
import { MarqueeRoom } from "./marquee-room";

export default async function MarqueePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people").select("id, full_name, preferred_name").eq("user_id", user!.id).single();

  const { data: membership } = await supabase
    .from("org_memberships").select("org_id, role").eq("person_id", person!.id).limit(1).single();

  if (!membership) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const orgId = membership.org_id;
  const canManage = membership.role === "owner" || membership.role === "production";

  // Resolve the active production. The cookie isn't always set (e.g. a person
  // who never used the switcher), and a person can be on several active shows,
  // so fall back deterministically to the soonest-opening one they can see —
  // never an arbitrary pick that lands on an empty room.
  const cookiePid = await getActiveProductionId();
  const ACTIVE_STATUSES = ["pre_production", "rehearsal", "tech", "in_run"];
  const { data: assignedRows } = await supabase
    .from("production_assignments")
    .select("productions!inner(id, status, opening_date)")
    .eq("person_id", person!.id)
    .eq("active", true)
    .in("productions.status", ACTIVE_STATUSES);
  let cands = (assignedRows || []).map(
    (a) => a.productions as unknown as { id: string; opening_date: string | null }
  );
  if (cands.length === 0 && ["owner", "production", "admin"].includes(membership.role)) {
    const { data } = await supabase
      .from("productions")
      .select("id, opening_date")
      .eq("org_id", orgId)
      .in("status", ACTIVE_STATUSES);
    cands = (data || []).map((p) => ({ id: p.id, opening_date: p.opening_date }));
  }
  const seenIds = new Set<string>();
  cands = cands.filter((c) => (seenIds.has(c.id) ? false : (seenIds.add(c.id), true)));
  cands.sort((a, b) => (a.opening_date || "9999").localeCompare(b.opening_date || "9999"));
  const candidateIds = cands.map((c) => c.id);
  const pid = candidateIds.find((id) => id === cookiePid) || candidateIds[0] || null;

  // Leadership (can approve/demote others' uploads): org owner/production/admin,
  // or a designer / SM / director / production-tier assignment on this show.
  let canApprove = ["owner", "production", "admin"].includes(membership.role);
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

  if (pid) {
    const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).single();
    prodTitle = prod?.title || "";

    const { data: rows } = await supabase
      .from("promo_assets")
      .select("id, file_name, mime_type, size_bytes, caption, created_at, uploaded_by, file_path, is_official, category, duration_seconds, people(full_name, preferred_name)")
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
      .select("person_id, people(full_name, preferred_name)")
      .eq("production_id", pid)
      .eq("active", true);
    const seen = new Set<string>();
    for (const a of rosterRows || []) {
      if (seen.has(a.person_id)) continue;
      seen.add(a.person_id);
      const pp = a.people as unknown as { full_name: string; preferred_name: string | null } | null;
      roster.push({ id: a.person_id, name: pp ? pp.preferred_name || pp.full_name : "—" });
    }
    roster.sort((a, b) => a.name.localeCompare(b.name));

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
      <p className="text-body-sm text-ash mb-6">
        Shared promo photos and flyers{prodTitle ? ` for ${prodTitle}` : ""}. Everyone can upload and download the originals.
      </p>

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
        />
      )}
    </div>
  );
}
