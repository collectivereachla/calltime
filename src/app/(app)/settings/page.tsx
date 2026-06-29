import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { resolveActingOrgId } from "@/lib/membership";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";
import { AdminTools } from "./admin-tools";
import { OrgSettings } from "./org-settings";
import { RoomVisibility } from "./room-visibility";
import { BrandColor } from "./brand-color";
import { AiFeatures } from "./ai-features";
import { TimezoneSetting } from "./timezone-setting";
import { NotificationSettings } from "./notification-settings";
import { W9Card } from "./w9-card";
import { CheckinPinCard } from "./checkin-pin-card";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, full_name, preferred_name, pronouns, email, phone, bio, birth_month, birth_day, is_minor, is_platform_admin"
    )
    .eq("id", personId!)
    .single();

  if (!person) redirect("/onboarding");

  const { data: ownership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("person_id", person.id)
    .eq("role", "owner");

  const isOwner = ownership && ownership.length > 0;

  // The TJS seed tools (reimport script, import blocking notes, invite TJS members)
  // act on a specific BTE production. Only show them to an owner of the org that
  // actually owns that script — not to every org owner.
  let canSeedTjs = false;
  if (isOwner) {
    const ownedOrgIds = ownership.map((o) => o.org_id);
    const { data: tjsScript } = await supabase
      .from("scripts")
      .select("productions!inner ( org_id )")
      .eq("id", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
      .maybeSingle();
    const tjsOrgId = (tjsScript?.productions as unknown as { org_id: string } | null)?.org_id;
    canSeedTjs = !!tjsOrgId && ownedOrgIds.includes(tjsOrgId);
  }

  // Get active production for room lock settings
  let activeProduction: { id: string; title: string; locked_rooms: string[] } | null = null;
  if (isOwner) {
    const { getActiveProductionId } = await import("@/lib/active-production");
    const activeId = await getActiveProductionId();
    if (activeId) {
      const { data } = await supabase
        .from("productions")
        .select("id, title, locked_rooms")
        .eq("id", activeId)
        .single();
      activeProduction = data;
    }
  }

  // Fetch org details for org settings — for the org the owner is ACTING in
  // (cookie-driven), not just their first owned org. A multi-org owner must see
  // the settings for the org they're currently working in.
  let orgData: { id: string; name: string; slug: string; description: string | null; city: string | null; state: string | null; website: string | null; logo_url: string | null } | null = null;
  let hiddenRooms: string[] = [];
  let accentDefault: string | null = null;
  let hideAi = false;
  let tzDefault: string | null = null;
  if (isOwner) {
    const ownedIds = ownership.map((o) => o.org_id);
    const actingOrgId = await resolveActingOrgId(person.id);
    const settingsOrgId =
      actingOrgId && ownedIds.includes(actingOrgId) ? actingOrgId : (ownedIds[0] ?? null);
    if (settingsOrgId) {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, slug, description, city, state, website, logo_url, settings")
        .eq("id", settingsOrgId)
        .single();
      if (data) {
        const { settings, ...rest } = data as typeof data & { settings: { hidden_rooms?: string[]; accent_color?: string; hide_ai?: boolean; timezone?: string } | null };
        orgData = rest;
        hiddenRooms = Array.isArray(settings?.hidden_rooms) ? settings!.hidden_rooms! : [];
        accentDefault = settings?.accent_color || null;
        hideAi = !!settings?.hide_ai;
        tzDefault = settings?.timezone || null;
      }
    }
  }


  // W-9 status (member's own, in their org)
  const w9OrgId = await resolveActingOrgId(person.id);
  let w9TaxYear: number | null = null;
  let w9SubmittedAt: string | null = null;
  if (w9OrgId) {
    const { data: w9row } = await supabase
      .from("member_details")
      .select("w9_tax_year, w9_submitted_at")
      .eq("person_id", person.id)
      .eq("org_id", w9OrgId)
      .maybeSingle();
    w9TaxYear = w9row?.w9_tax_year ?? null;
    w9SubmittedAt = w9row?.w9_submitted_at ?? null;
  }

  // Does this member already have a check-in PIN in their acting org?
  let hasPin = false;
  if (w9OrgId) {
    const { data: pinRow } = await supabase
      .from("member_details")
      .select("checkin_pin")
      .eq("person_id", person.id)
      .eq("org_id", w9OrgId)
      .maybeSingle();
    hasPin = !!(pinRow?.checkin_pin && pinRow.checkin_pin.trim());
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 md:px-0">
      <h1 className="font-display text-display-lg text-ink mb-1">Settings</h1>
      <p className="text-body-sm text-ash mb-8">
        Manage your profile and account.
      </p>

      <SettingsForm person={person} userEmail={user.email || ""} />

      <div className="mt-10 pt-8 border-t border-bone">
        <h3 className="font-display text-display-sm mb-1">My conflicts</h3>
        <p className="text-body-sm text-ash mb-3">Submit and edit the dates you can&rsquo;t make it &mdash; single days, ranges, part of a day, or repeating &mdash; all in one place.</p>
        <a href="/availability" className="inline-block px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">Open my conflict calendar</a>
      </div>

      {(person as { is_platform_admin?: boolean }).is_platform_admin && (
        <div className="mt-10 pt-8 border-t border-bone">
          <h3 className="font-display text-display-sm mb-1">Appearance</h3>
          <p className="text-body-sm text-ash mb-3">Tune Calltime&rsquo;s colors and fonts (platform admin).</p>
          <a href="/admin/theme" className="inline-block px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">Open the theme editor</a>
        </div>
      )}

      <W9Card w9TaxYear={w9TaxYear} submittedAt={w9SubmittedAt} />

      <CheckinPinCard hasPin={hasPin} />

      <div className="mt-10 pt-8 border-t border-bone">
        <NotificationSettings personId={person.id} />
      </div>

      {isOwner && orgData && <OrgSettings org={orgData} />}

      {isOwner && orgData && (
        <div className="mt-10">
          <RoomVisibility orgId={orgData.id} hidden={hiddenRooms} />
        </div>
      )}

      {isOwner && orgData && (
        <div className="mt-10">
          <BrandColor orgId={orgData.id} current={accentDefault} logoUrl={orgData.logo_url} />
        </div>
      )}

      {isOwner && orgData && (
        <div className="mt-10">
          <TimezoneSetting orgId={orgData.id} current={tzDefault} />
        </div>
      )}

      {isOwner && orgData && (
        <div className="mt-10">
          <AiFeatures orgId={orgData.id} hidden={hideAi} />
        </div>
      )}

      {isOwner && (
        <div className="mt-10">
          <AdminTools activeProduction={activeProduction} canSeedTjs={canSeedTjs} />
        </div>
      )}
    </div>
  );
}
