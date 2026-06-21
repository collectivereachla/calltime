import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { PlaybillBody } from "./playbill-body";

export const dynamic = "force-dynamic";

export default async function PlaybillPrintPage({
  searchParams,
}: { searchParams: Promise<{ p?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sp = (await searchParams) || {};
  const pid = (typeof sp.p === "string" ? sp.p : null) || (await getActiveProductionId());
  if (!pid) redirect("/playbill");

  const { data: prod } = await supabase
    .from("productions").select("id, title, org_id").eq("id", pid).maybeSingle();
  if (!prod) redirect("/playbill");

  const { data: playbill } = await supabase
    .from("playbills").select("*").eq("production_id", pid).maybeSingle();
  if (!playbill) redirect("/playbill");

  const { data: org } = await supabase
    .from("organizations").select("name").eq("id", prod.org_id).maybeSingle();

  return (
    <PlaybillBody
      supabase={supabase}
      pid={pid}
      prod={prod}
      playbill={playbill}
      orgName={org?.name || ""}
      chrome
    />
  );
}
