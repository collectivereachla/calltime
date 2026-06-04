import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { getRoleInOrg, isLeadershipRole, resolveActingOrgId } from "@/lib/membership";
import { InventoryRoom } from "./inventory-room";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: person } = await supabase.from("people").select("id").eq("id", personId!).maybeSingle();
  if (!person) redirect("/login");

  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) redirect("/home");
  const role = await getRoleInOrg(person.id, orgId);
  if (!isLeadershipRole(role)) redirect("/home");

  const [{ data: org }, { data: items }, { data: productions }, activePid] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("inventory_items").select("*").eq("org_id", orgId).order("kind").order("name"),
    supabase.from("productions").select("id, title").eq("org_id", orgId).not("status", "in", "(closed,archived)").order("opening_date", { ascending: true, nullsFirst: false }),
    getActiveProductionId(),
  ]);

  // Active checkouts across this org's items, with the production they're in.
  const itemIds = (items || []).map((i) => i.id);
  let checkouts: { id: string; item_id: string; production_id: string; quantity: number; productions: { title: string } | null }[] = [];
  if (itemIds.length) {
    const { data } = await supabase
      .from("inventory_checkouts")
      .select("id, item_id, production_id, quantity, productions(title)")
      .in("item_id", itemIds)
      .eq("status", "out");
    checkouts = (data as unknown as typeof checkouts) || [];
  }

  return (
    <InventoryRoom
      orgName={org?.name || "Organization"}
      items={items || []}
      checkouts={checkouts}
      productions={productions || []}
      activeProductionId={activePid || null}
    />
  );
}
