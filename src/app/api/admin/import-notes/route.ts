import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import notesData from "@/data/tjs_blocking_notes.json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SCRIPT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const JOSIAH_PERSON_ID = "0f0be692-d275-43ac-9570-d67d90050982";

const ALL_CHARACTERS = [
  "AUNT EMMA", "AUNT SISSY", "MAE", "JOHN", "ISAAC", "BELLE", "ESTHER",
  "ASHMAY", "PEACHES", "MASSA", "OVERSEER", "SOLDIER", "MAMA EUNICE",
  "ALEX", "ALEXANDRA", "ANTOINETTE", "MATTHEW", "SAMUEL", "DADDY",
  "ANNIE WILL", "REV. MARSHALL", "THEODIS", "LILLY", "QUEEN MOTHER",
  "CAROLINE", "ARCHIE", "TOM", "JEREMY", "MAMA", "JANET", "TONI",
  "IMANI", "JAYDEN",
  // Cast names that appear in blocking notes
  "JOSH", "JOSHUA", "AHYRIS", "AHRYIS", "TEKA", "SINGER", "MITCH",
];

function extractCharacters(noteText: string): string[] {
  const upper = noteText.toUpperCase();
  const found = new Set<string>();

  // Sort by length (longest first) to match "MAMA EUNICE" before "MAMA"
  const sorted = [...ALL_CHARACTERS].sort((a, b) => b.length - a.length);

  for (const char of sorted) {
    // Use word boundary matching to avoid partial matches
    const pattern = new RegExp(`\\b${char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(upper)) {
      // Don't add "MAMA" if "MAMA EUNICE" is already found
      if (char === "MAMA" && found.has("MAMA EUNICE")) continue;
      found.add(char);
    }
  }

  return [...found];
}

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

  // Get all script lines for matching
  const { data: lines, error: linesErr } = await supabase
    .from("script_lines")
    .select("id, act, scene, content, character")
    .eq("script_id", SCRIPT_ID)
    .order("line_number");

  if (linesErr || !lines) {
    return NextResponse.json(
      { error: `Failed to load lines: ${linesErr?.message}` },
      { status: 500 }
    );
  }

  const notes = notesData as {
    act: number;
    scene: number;
    match_prefix: string;
    note: string;
  }[];

  let inserted = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const note of notes) {
    // Find matching line: same act+scene, content starts with match_prefix
    const prefix = note.match_prefix.toLowerCase().substring(0, 30);
    const match = lines.find(
      (l) =>
        l.act === note.act &&
        l.scene === note.scene &&
        l.content.toLowerCase().includes(prefix)
    );

    if (!match) {
      failed++;
      failures.push(
        `No match for act ${note.act} scene ${note.scene}: "${note.match_prefix.substring(0, 40)}..."`
      );
      continue;
    }

    // Extract tagged characters from the note text
    const tagged = extractCharacters(note.note);
    // Also include the line's character if it has one
    if (match.character && !tagged.includes(match.character)) {
      tagged.push(match.character);
    }

    const { error: insertErr } = await supabase
      .from("script_annotations")
      .insert({
        script_line_id: match.id,
        person_id: JOSIAH_PERSON_ID,
        annotation_type: "blocking",
        content: note.note,
        tagged_characters: tagged.length > 0 ? tagged : null,
        visibility: "company",
      });

    if (insertErr) {
      failed++;
      failures.push(`Insert failed: ${insertErr.message}`);
    } else {
      inserted++;
    }
  }

  return NextResponse.json({
    message: `Notes import complete`,
    inserted,
    failed,
    total: notes.length,
    failures: failures.length > 0 ? failures.slice(0, 10) : undefined,
  });
}
