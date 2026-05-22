import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import parsedScript from "@/data/tjs_script_parsed.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCRIPT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

export async function POST() {
  // Verify caller is an org owner
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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

  const admin = createAdminClient();

  // Step 1: Save existing annotations for re-matching
  const { data: annotations } = await admin
    .from("script_annotations")
    .select("id, script_line_id, person_id, annotation_type, content")
    .in(
      "script_line_id",
      (
        await admin
          .from("script_lines")
          .select("id")
          .eq("script_id", SCRIPT_ID)
      ).data?.map((l) => l.id) || []
    );

  // Get old line content for matching
  const oldLines = new Map<string, string>();
  if (annotations && annotations.length > 0) {
    const lineIds = [...new Set(annotations.map((a) => a.script_line_id))];
    const { data: lines } = await admin
      .from("script_lines")
      .select("id, content")
      .in("id", lineIds);

    for (const line of lines || []) {
      oldLines.set(line.id, line.content);
    }
  }

  // Step 2: Delete old data (annotations cascade)
  await admin
    .from("script_annotations")
    .delete()
    .in(
      "script_line_id",
      (
        await admin
          .from("script_lines")
          .select("id")
          .eq("script_id", SCRIPT_ID)
      ).data?.map((l) => l.id) || []
    );

  await admin
    .from("script_lines")
    .delete()
    .eq("script_id", SCRIPT_ID);

  // Step 3: Insert new lines from parsed data
  const lines = (parsedScript as { act: number; scene: number; type: string; character: string | null; content: string }[]);

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
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await admin.from("script_lines").insert(batch);
    if (error) {
      return NextResponse.json(
        {
          error: `Insert failed at batch ${i / 100}: ${error.message}`,
          inserted,
        },
        { status: 500 }
      );
    }
    inserted += batch.length;
  }

  // Step 4: Re-attach annotations by matching content
  let reattached = 0;
  let orphaned = 0;

  if (annotations && annotations.length > 0) {
    // Get all new lines for matching
    const { data: newLines } = await admin
      .from("script_lines")
      .select("id, content")
      .eq("script_id", SCRIPT_ID);

    const contentToId = new Map<string, string>();
    for (const nl of newLines || []) {
      contentToId.set(nl.content, nl.id);
    }

    for (const ann of annotations) {
      const oldContent = oldLines.get(ann.script_line_id);
      if (!oldContent) {
        orphaned++;
        continue;
      }

      // Try exact match first
      let newLineId = contentToId.get(oldContent);

      // Try partial match (first 50 chars)
      if (!newLineId) {
        const prefix = oldContent.substring(0, 50);
        for (const [content, id] of contentToId) {
          if (content.startsWith(prefix)) {
            newLineId = id;
            break;
          }
        }
      }

      if (newLineId) {
        await admin.from("script_annotations").insert({
          script_line_id: newLineId,
          person_id: ann.person_id,
          annotation_type: ann.annotation_type,
          content: ann.content,
        });
        reattached++;
      } else {
        orphaned++;
      }
    }
  }

  // Step 5: Restore FK constraint if it was dropped
  try {
    await admin.rpc("exec_sql" as never, {
      query: `ALTER TABLE script_annotations 
        ADD CONSTRAINT script_annotations_script_line_id_fkey 
        FOREIGN KEY (script_line_id) REFERENCES script_lines(id) ON DELETE CASCADE;`,
    });
  } catch {
    // Constraint may already exist
  }

  return NextResponse.json({
    message: "Script reimported successfully",
    lines_inserted: inserted,
    annotations_reattached: reattached,
    annotations_orphaned: orphaned,
    total_parsed: lines.length,
  });
}
