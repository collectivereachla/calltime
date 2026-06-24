import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import parsedScript from "@/data/tjs_script_parsed.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCRIPT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify owner
  const { data: caller } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!caller) {
    return NextResponse.json({ error: "No person record" }, { status: 403 });
  }

  const { data: ownership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("person_id", caller.id)
    .eq("role", "owner");

  if (!ownership || ownership.length === 0) {
    return NextResponse.json({ error: "Not an org owner" }, { status: 403 });
  }

  // Authorize against the org that actually owns this script — not "any org."
  // Resolve deterministically via the service role, then require the caller owns it.
  const ownedOrgIds = ownership.map((o) => o.org_id);
  const adminClient = createAdminClient();
  const { data: scriptRow } = await adminClient
    .from("scripts")
    .select("productions!inner ( org_id )")
    .eq("id", SCRIPT_ID)
    .maybeSingle();
  const scriptOrgId = (scriptRow?.productions as unknown as { org_id: string } | null)?.org_id;
  if (!scriptOrgId || !ownedOrgIds.includes(scriptOrgId)) {
    return NextResponse.json({ error: "You don't own the organization this script belongs to" }, { status: 403 });
  }

  // Build rows from parsed data
  const lines = parsedScript as {
    act: number;
    scene: number;
    type: string;
    character: string | null;
    content: string;
  }[];

  // Delete old lines first (annotations cascade)
  const { error: deleteErr } = await supabase
    .from("script_lines")
    .delete()
    .eq("script_id", SCRIPT_ID);

  if (deleteErr) {
    return NextResponse.json(
      { error: `Delete failed: ${deleteErr.message}` },
      { status: 500 }
    );
  }

  const rows = lines.map((p, i) => ({
    script_id: SCRIPT_ID,
    line_number: i + 1,
    act: p.act,
    scene: p.scene,
    line_type: p.type === "scene_header" ? "stage_direction" : p.type,
    character: p.character || null,
    content: p.content,
  }));

  // Insert in batches of 100
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("script_lines").insert(batch);
    if (error) {
      errors.push(`Batch ${i / 100}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return NextResponse.json({
    message: "Script reimport complete",
    lines_inserted: inserted,
    total_parsed: lines.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
