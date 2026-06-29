import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { resolveActingOrgId } from "@/lib/membership";

export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const { personId } = await getViewer(supabase);
  if (!personId) return new Response("Unauthorized", { status: 401 });

  const orgId = await resolveActingOrgId(personId);
  if (!orgId) return new Response("No organization", { status: 400 });

  // Owner-only export of the acting org.
  const { data: own } = await supabase
    .from("org_memberships").select("role").eq("org_id", orgId).eq("person_id", personId).maybeSingle();
  if (!own || own.role !== "owner") return new Response("Owners only", { status: 403 });

  const { data: org } = await supabase
    .from("organizations").select("id, name, slug, city, state, description, website, settings").eq("id", orgId).maybeSingle();

  const { data: roster } = await supabase
    .from("org_memberships")
    .select("role, finance_access, created_at, people!inner(full_name, preferred_name, email, phone, pronouns, archived_at)")
    .eq("org_id", orgId);

  const { data: productions } = await supabase
    .from("productions")
    .select("id, title, playwright, venue, status, first_rehearsal, opening_date, closing_date")
    .eq("org_id", orgId)
    .order("opening_date", { ascending: false, nullsFirst: false });

  const prodIds = (productions || []).map((p) => p.id);
  let events: unknown[] = [];
  if (prodIds.length > 0) {
    const { data: ev } = await supabase
      .from("schedule_events")
      .select("production_id, title, event_type, kind, event_date, start_time, end_time, location, mandatory, published")
      .in("production_id", prodIds)
      .order("event_date", { ascending: true });
    events = ev || [];
  }

  const members = (roster || [])
    .map((m) => {
      const p = m.people as unknown as { full_name: string; preferred_name: string | null; email: string | null; phone: string | null; pronouns: string | null; archived_at: string | null } | null;
      if (!p || p.archived_at) return null;
      return { name: p.preferred_name || p.full_name, full_name: p.full_name, email: p.email, phone: p.phone, pronouns: p.pronouns, role: m.role, finance_access: m.finance_access === true, joined: m.created_at };
    })
    .filter(Boolean);

  const payload = {
    exported_at: new Date().toISOString(),
    organization: org,
    members,
    productions: productions || [],
    schedule_events: events,
  };

  const slug = (org?.slug as string) || "calltime";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}-calltime-export-${date}.json"`,
    },
  });
}
