import { createClient } from "@/lib/supabase/server";
import { getActiveProductionId } from "@/lib/active-production";

// Authorization in Calltime is always scoped to a specific organization. A
// person has MANY memberships (one per org they work with), so "what is my
// role?" is meaningless without an org. These helpers replace the old
// `org_memberships...limit(1).single()` pattern, which picked an arbitrary
// membership and silently mis-authorized anyone in more than one org.

export function isLeadershipRole(role: string | null): boolean {
  return role === "owner" || role === "production";
}

export function isOwnerRole(role: string | null): boolean {
  return role === "owner";
}

/** The person's role in ONE specific org, or null if they aren't a member. */
export async function getRoleInOrg(
  personId: string,
  orgId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", personId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

/** The org that owns a production. */
export async function orgIdForProduction(
  productionId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productions")
    .select("org_id")
    .eq("id", productionId)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

/**
 * The org that owns a row, resolved via its `production_id` column. Works for
 * contracts, contract_templates, budget_items, revenue_items — every Ledger
 * entity hangs off a production, and the production hangs off an org.
 */
export async function orgIdForRow(
  table: string,
  id: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from(table)
    .select("production_id")
    .eq("id", id)
    .maybeSingle();
  const productionId = data?.production_id as string | undefined;
  if (!productionId) return null;
  return orgIdForProduction(productionId);
}

/**
 * Deterministically resolve "which org am I acting in right now": the active
 * show's org if one is selected, otherwise the person's sole org if they have
 * exactly one (unambiguous), otherwise null. Never picks arbitrarily.
 */
export async function resolveActingOrgId(
  personId: string
): Promise<string | null> {
  const activeProductionId = await getActiveProductionId();
  if (activeProductionId) {
    const org = await orgIdForProduction(activeProductionId);
    if (org) return org;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("person_id", personId);

  if (!data || data.length === 0) return null;
  if (data.length === 1) return data[0].org_id as string;

  // Multi-org: don't give up. Prefer an org where this person has an active
  // production assignment (the show they're actually working in), then an org
  // they own, then the first membership — always deterministic, never null.
  const orgIds = data.map((m) => m.org_id as string);
  const { data: assigns } = await supabase
    .from("production_assignments")
    .select("productions!inner(org_id)")
    .eq("person_id", personId)
    .eq("active", true);
  const workedOrgIds = new Set(
    (assigns || [])
      .map((a) => (a.productions as unknown as { org_id: string } | null)?.org_id)
      .filter((id): id is string => !!id && orgIds.includes(id))
  );
  if (workedOrgIds.size > 0) {
    // Keep a stable choice: first membership row that's in the worked set.
    const hit = data.find((m) => workedOrgIds.has(m.org_id as string));
    if (hit) return hit.org_id as string;
  }
  const owned = data.find((m) => m.role === "owner");
  if (owned) return owned.org_id as string;
  return data[0].org_id as string;
}

/**
 * Finance access for ONE org: the org owner, or anyone explicitly granted
 * finance_access (e.g. a producer who runs the budget but isn't an owner and
 * must never see the donor Rolodex). This is the gate for the whole /ledger
 * domain — budget, invoices, receipts, contracts, payers, payment settings.
 */
export async function canManageFinance(
  personId: string,
  orgId: string | null
): Promise<boolean> {
  if (!orgId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("role, finance_access")
    .eq("person_id", personId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return false;
  return data.role === "owner" || data.finance_access === true;
}
