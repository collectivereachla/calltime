import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { PlaybillBody } from "../../playbill-print/playbill-body";
import type { Metadata } from "next";

// Public program page. No login. Renders live from the rooms via the admin
// client (no session), and ONLY when the playbill is explicitly web-published.
export const dynamic = "force-dynamic";

async function load(id: string) {
  const admin = createAdminClient();
  const { data: prod } = await admin
    .from("productions").select("id, title, org_id").eq("id", id).maybeSingle();
  if (!prod) return null;
  const { data: playbill } = await admin
    .from("playbills").select("*").eq("production_id", id).maybeSingle();
  if (!playbill || !playbill.web_published) return null;
  const { data: org } = await admin
    .from("organizations").select("name").eq("id", prod.org_id).maybeSingle();
  return { admin, prod, playbill, orgName: org?.name || "" };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: "Program" };
  const t = (data.playbill.cover_title as string) || data.prod.title;
  return { title: `${t} — Program`, description: `Program for ${t}` };
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();

  return (
    <PlaybillBody
      supabase={data.admin}
      pid={id}
      prod={data.prod}
      playbill={data.playbill}
      orgName={data.orgName}
      chrome={false}
    />
  );
}
