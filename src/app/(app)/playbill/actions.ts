"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotPreviewing } from "@/lib/viewer";
import { revalidatePath } from "next/cache";

async function requireLeadership(orgId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return { ok: false as const, error: "No member profile." };
  const { data: mem } = await supabase
    .from("org_memberships").select("role").eq("person_id", me.id).eq("org_id", orgId).maybeSingle();
  if (!mem || !["owner", "production"].includes(mem.role as string)) {
    return { ok: false as const, error: "Only production leadership can edit the playbill." };
  }
  return { ok: true as const, meId: me.id };
}

type SongSceneList = { act: string; items: { title: string; detail?: string }[] }[];

const ACT_LABEL: Record<number, string> = { 1: "Act I", 2: "Act II", 3: "Act III", 4: "Act IV" };
const actLabel = (n: number) => ACT_LABEL[n] || `Act ${n}`;

// Drop the "Song:" label a script line carries, but keep the title verbatim —
// curly quotes, apostrophes, and punctuation are published text, never normalized.
const songTitleFromLine = (raw: string) => raw.replace(/^\s*song\s*:\s*/i, "").trim();

// Build the playbill's Songs & Scenes section from what the rooms already hold.
// mode "full": every scene as a row (rich title + setting) with each musical number
//   slotted into its scene — the complete stage-management breakdown.
// mode "audience": just the acts, each headed by its setting (taken from the first
//   scene in the act that has one), with that act's musical numbers listed underneath —
//   the cleaner front-of-house format.
// The active script mirrors Spine: prefer the working (unlocked) version, else the most recent.
async function buildSongSceneList(
  admin: ReturnType<typeof createAdminClient>,
  productionId: string,
  mode: "full" | "audience" = "full",
): Promise<SongSceneList> {
  const { data: scenes } = await admin
    .from("scenes")
    .select("act, scene_number, title, location, time_period, sort_order")
    .eq("production_id", productionId)
    .order("sort_order", { ascending: true });

  // Resolve which script the musical numbers come from.
  const { data: scripts } = await admin
    .from("scripts")
    .select("id, is_locked, created_at")
    .eq("production_id", productionId)
    .order("created_at", { ascending: false });
  const activeScriptId =
    scripts?.find((s) => !s.is_locked)?.id ?? scripts?.[0]?.id ?? null;

  type Song = { act: number | null; scene: number | null; content: string };
  let songs: Song[] = [];
  if (activeScriptId) {
    const { data: songRows } = await admin
      .from("script_lines")
      .select("act, scene, content, line_number")
      .eq("script_id", activeScriptId)
      .eq("line_type", "song_title")
      .order("line_number", { ascending: true });
    songs = (songRows ?? []) as Song[];
  }

  const list: SongSceneList = [];

  if (scenes && scenes.length) {
    const byAct = new Map<number, typeof scenes>();
    for (const sc of scenes) {
      const a = (sc.act as number) ?? 1;
      if (!byAct.has(a)) byAct.set(a, []);
      byAct.get(a)!.push(sc);
    }
    for (const [actNum, actScenes] of [...byAct.entries()].sort((x, y) => x[0] - y[0])) {
      const actSongs = songs.filter((s) => s.act === actNum);

      if (mode === "audience") {
        // The act's setting: first scene that carries a location/time.
        let setting = "";
        for (const sc of actScenes) {
          const parts = [sc.location, sc.time_period].filter(Boolean) as string[];
          if (parts.length) { setting = parts.join(", "); break; }
        }
        list.push({
          act: setting ? `${actLabel(actNum)}: ${setting}` : actLabel(actNum),
          items: actSongs
            .sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0))
            .map((s) => ({ title: songTitleFromLine(s.content as string) })),
        });
        continue;
      }

      // Full breakdown: every scene, with its musical numbers slotted in.
      const items: { title: string; detail?: string }[] = [];
      for (const sc of actScenes) {
        const setting = [sc.location, sc.time_period].filter(Boolean) as string[];
        items.push({
          title: (sc.title as string) || `Scene ${sc.scene_number}`,
          detail: setting.length ? setting.join(" · ") : undefined,
        });
        for (const song of actSongs.filter((s) => s.scene === sc.scene_number)) {
          items.push({ title: songTitleFromLine(song.content as string) });
        }
      }
      list.push({ act: actLabel(actNum), items });
    }
  } else if (songs.length) {
    // No scene breakdown built yet — at least surface the musical numbers by act.
    const byAct = new Map<number, Song[]>();
    for (const s of songs) {
      const a = s.act ?? 1;
      if (!byAct.has(a)) byAct.set(a, []);
      byAct.get(a)!.push(s);
    }
    for (const [actNum, actSongs] of [...byAct.entries()].sort((x, y) => x[0] - y[0])) {
      list.push({
        act: actLabel(actNum),
        items: actSongs.map((s) => ({ title: songTitleFromLine(s.content as string) })),
      });
    }
  }

  return list;
}

// Get the playbill for a production, creating an empty one on first open.
export async function ensurePlaybill(productionId: string, orgId: string) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error, playbill: null };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("playbills").select("*").eq("production_id", productionId).maybeSingle();
  if (existing) return { error: null, playbill: existing };

  // Pre-fill a brand-new playbill from what Calltime already knows, so it opens
  // as a draft instead of a blank page. Only used at creation; never overwrites.
  const { data: prod } = await admin
    .from("productions")
    .select("title, playwright, venue, opening_date")
    .eq("id", productionId).maybeSingle();

  // Show-info blurb: pull the rider OVERVIEW (run time / acts / setting) if present.
  const { data: overview } = await admin
    .from("rider_sections")
    .select("body")
    .eq("production_id", productionId)
    .ilike("title", "%overview%")
    .limit(1).maybeSingle();

  const showInfoParts: string[] = [];
  if (prod?.venue) showInfoParts.push(prod.venue as string);
  if (prod?.opening_date) {
    const d = new Date((prod.opening_date as string) + "T12:00:00");
    showInfoParts.push(d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  }
  if (overview?.body) showInfoParts.push((overview.body as string).trim());

  const songSceneList = await buildSongSceneList(admin, productionId);

  const seed = {
    production_id: productionId,
    org_id: orgId,
    cover_title: (prod?.title as string) || null,
    cover_subtitle: prod?.playwright ? `Written by ${prod.playwright}` : null,
    show_info: showInfoParts.length ? showInfoParts.join("\n\n") : null,
    song_scene_list: songSceneList,
  };

  const { data: created, error } = await admin
    .from("playbills")
    .insert(seed)
    .select("*")
    .single();
  if (error) return { error: error.message, playbill: null };
  revalidatePath("/playbill");
  return { error: null, playbill: created };
}

type PlaybillFields = {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  dedication?: string | null;
  show_info?: string | null;
  directors_note?: string | null;
  song_scene_list?: unknown;
  special_thanks?: string | null;
  include_cast?: boolean;
  include_creative_team?: boolean;
  cover_image_path?: string | null;
  section_config?: { key: string; visible?: boolean }[];
  custom_sections?: { id: string; title: string; body: string }[];
};

// Recompute the Songs & Scenes section from the rooms on demand (for playbills that
// already exist and so never ran the creation-time prefill). Returns the list for the
// editor to load into the form; it does NOT save — leadership reviews, then saves.
export async function pullSongsScenes(productionId: string, orgId: string, mode: "full" | "audience" = "full") {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error, list: null };
  const admin = createAdminClient();
  const list = await buildSongSceneList(admin, productionId, mode);
  return { error: null, list };
}

export async function savePlaybill(playbillId: string, orgId: string, fields: PlaybillFields) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("playbills")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", playbillId);
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}

export async function addCredit(playbillId: string, orgId: string, credit: {
  credit_type: "sponsor" | "ad" | "acknowledgment" | "partner";
  name: string; detail?: string | null; link_url?: string | null; image_path?: string | null;
}) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };
  if (!credit.name?.trim()) return { error: "Name is required." };

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("playbill_credits").select("sort_order").eq("playbill_id", playbillId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await admin.from("playbill_credits").insert({
    playbill_id: playbillId,
    credit_type: credit.credit_type,
    name: credit.name.trim(),
    detail: credit.detail || null,
    link_url: credit.link_url || null,
    image_path: credit.image_path || null,
    sort_order: nextOrder,
  });
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}

export async function deleteCredit(creditId: string, orgId: string) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("playbill_credits").delete().eq("id", creditId);
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}

// Attach (or clear, with null) a sponsor/partner logo. The image itself is
// uploaded client-side to the promo-assets bucket; this stores its path.
export async function setCreditImage(creditId: string, orgId: string, imagePath: string | null) {
  await assertNotPreviewing();
  const guard = await requireLeadership(orgId);
  if (!guard.ok) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("playbill_credits")
    .update({ image_path: imagePath })
    .eq("id", creditId);
  if (error) return { error: error.message };
  revalidatePath("/playbill");
  return { error: null };
}
