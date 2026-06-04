import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Owner "Preview as" — see the app exactly as another person sees it.
//
// The actor — the person — owns their account; identity is resolved from the
// live auth session everywhere. Preview NEVER changes who is authenticated. It
// only changes which person READS resolve to, and only when:
//   - the real signed-in person is an OWNER in at least one org, and
//   - the previewed person is inside one of that owner's orgs (member OR
//     assignee — contestants/parents are assignment-only and must be
//     previewable too).
//
// Writes are unaffected: every mutation authenticates as the real user, so a
// previewer can never act as the previewed person. On top of that,
// `assertNotPreviewing()` hard-stops user-initiated writes while preview is on,
// so the mode is genuinely read-only.
// ---------------------------------------------------------------------------

export const PREVIEW_COOKIE = "calltime_preview_as";

export type ViewerPerson = {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
};

export type Viewer = {
  /** The authenticated auth user (or null if signed out). */
  user: { id: string } | null;
  /** The real signed-in person (never the previewed one). */
  realPersonId: string | null;
  realPerson: ViewerPerson | null;
  /** The EFFECTIVE person reads should resolve to (previewed target, or real). */
  personId: string | null;
  person: ViewerPerson | null;
  /** True when actively viewing as someone else. */
  isPreview: boolean;
  /** True when the real person is allowed to use Preview (is an owner). */
  canPreview: boolean;
  /** A preview cookie exists (may be stale/invalid). */
  previewCookiePresent: boolean;
  /** Org ids the REAL person owns — the scope of who they may preview. */
  ownerOrgIds: string[];
};

const DISPLAY_COLS = "id, full_name, preferred_name";

/** True if `targetId` is a member of, or actively assigned within, any of `ownerOrgIds`. */
export async function targetIsInOwnerOrgs(
  supabase: SupabaseClient,
  targetId: string,
  ownerOrgIds: string[]
): Promise<boolean> {
  if (ownerOrgIds.length === 0) return false;
  const { data: mem } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("person_id", targetId)
    .in("org_id", ownerOrgIds)
    .limit(1);
  if (mem && mem.length > 0) return true;
  const { data: asg } = await supabase
    .from("production_assignments")
    .select("id, productions!inner(org_id)")
    .eq("person_id", targetId)
    .eq("active", true)
    .in("productions.org_id", ownerOrgIds)
    .limit(1);
  return !!(asg && asg.length > 0);
}

/**
 * Resolve the viewer: real identity, plus the effective (possibly previewed)
 * identity. Pass an existing server Supabase client.
 */
export async function getViewer(supabase: SupabaseClient): Promise<Viewer> {
  const empty: Viewer = {
    user: null, realPersonId: null, realPerson: null, personId: null,
    person: null, isPreview: false, canPreview: false,
    previewCookiePresent: false, ownerOrgIds: [],
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: realPerson } = await supabase
    .from("people")
    .select(DISPLAY_COLS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!realPerson) {
    return { ...empty, user: { id: user.id } };
  }

  // Which orgs does the real person OWN? That is the preview scope.
  const { data: ms } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("person_id", realPerson.id);
  const ownerOrgIds = (ms || [])
    .filter((m) => m.role === "owner")
    .map((m) => m.org_id as string);
  const canPreview = ownerOrgIds.length > 0;

  const jar = await cookies();
  const cookieVal = jar.get(PREVIEW_COOKIE)?.value || null;
  const previewCookiePresent = !!cookieVal;

  let person: ViewerPerson = realPerson;
  let isPreview = false;

  if (canPreview && cookieVal && cookieVal !== realPerson.id) {
    const { data: target } = await supabase
      .from("people")
      .select(DISPLAY_COLS)
      .eq("id", cookieVal)
      .maybeSingle();
    if (target && (await targetIsInOwnerOrgs(supabase, target.id, ownerOrgIds))) {
      person = target;
      isPreview = true;
    }
  }

  return {
    user: { id: user.id },
    realPersonId: realPerson.id,
    realPerson,
    personId: person.id,
    person,
    isPreview,
    canPreview,
    previewCookiePresent,
    ownerOrgIds,
  };
}

/** Lightweight cookie check for the write-guard (no DB round-trip). */
export async function isPreviewing(): Promise<boolean> {
  const jar = await cookies();
  return !!jar.get(PREVIEW_COOKIE)?.value;
}

/**
 * Hard-stop a user-initiated write while previewing. Called at the top of
 * mutation server actions. Preview is read-only; the owner must exit to act.
 */
export async function assertNotPreviewing(): Promise<void> {
  if (await isPreviewing()) {
    throw new Error("Preview is read-only. Exit preview to make changes.");
  }
}

/** People the owner may preview: everyone in their owned orgs (members + assignees). */
export async function getPreviewablePeople(
  supabase: SupabaseClient,
  ownerOrgIds: string[]
): Promise<{ id: string; name: string }[]> {
  if (ownerOrgIds.length === 0) return [];
  const ids = new Set<string>();

  const { data: mem } = await supabase
    .from("org_memberships")
    .select("person_id")
    .in("org_id", ownerOrgIds);
  (mem || []).forEach((m) => ids.add(m.person_id as string));

  const { data: asg } = await supabase
    .from("production_assignments")
    .select("person_id, productions!inner(org_id)")
    .eq("active", true)
    .in("productions.org_id", ownerOrgIds);
  (asg || []).forEach((a) => ids.add(a.person_id as string));

  if (ids.size === 0) return [];

  const { data: ppl } = await supabase
    .from("people")
    .select(DISPLAY_COLS)
    .in("id", Array.from(ids));

  return (ppl || [])
    .map((p) => ({
      id: p.id as string,
      name: (p.preferred_name as string) || (p.full_name as string) || "Unnamed",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
