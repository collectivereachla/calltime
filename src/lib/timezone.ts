import { createClient } from "@/lib/supabase/server";

// Calltime's historical default. getOrgTimezone ALWAYS returns a valid IANA tz
// (never empty) so date formatting can't silently fall back to UTC.
export const DEFAULT_TIMEZONE = "America/Chicago";

/** The org's configured timezone (organizations.settings.timezone), or Central. */
export async function getOrgTimezone(orgId: string | null | undefined): Promise<string> {
  if (!orgId) return DEFAULT_TIMEZONE;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const tz = (data?.settings as Record<string, unknown> | null)?.timezone;
  return typeof tz === "string" && tz.length > 0 ? tz : DEFAULT_TIMEZONE;
}
