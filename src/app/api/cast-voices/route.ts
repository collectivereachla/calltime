import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";

export const maxDuration = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
    if (person) {
      const orgId = await resolveActingOrgId(person.id);
      if (orgId) {
        const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        if ((org?.settings as { hide_ai?: boolean } | null)?.hide_ai) {
          return NextResponse.json({ error: "AI features are turned off for this organization." }, { status: 403 });
        }
      }
    }
  }

  const body = await request.json();
  const characters = Array.isArray(body.characters) ? body.characters : [];
  const voices = Array.isArray(body.voices) ? body.voices : [];
  if (!characters.length || !voices.length) return NextResponse.json({ error: "Missing characters or voices" }, { status: 400 });

  const voiceList = voices.map((v: any) => `- ${v.id}: ${v.desc}`).join("\n");
  const charList = characters.map((c: any) => `### ${c.name}\n${String(c.sample || "").slice(0, 240)}`).join("\n\n");
  const prompt = `You are casting voices for a play's line-running tool. Assign each CHARACTER exactly one VOICE id, based on the character's likely gender, age, and temperament inferred from their lines (and your knowledge of the play if you recognize it). Match gender first, then age and temperament. Use distinct voices where you can; only reuse a voice when there are more characters than voices, and keep gender consistent when you do.

VOICES:
${voiceList}

CHARACTERS (name + sample lines):
${charList}

RESPOND WITH ONLY RAW JSON, no markdown, no backticks: {"assignments":{"CHARACTER NAME":"voice-id"}}. Use the exact character names given and only voice ids from the VOICES list.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const e = await r.text(); return NextResponse.json({ error: `Anthropic error ${r.status}: ${e.slice(0, 200)}` }, { status: 502 }); }
    const data = await r.json();
    const raw = data.content?.[0]?.text || "";
    const js = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const a = js.indexOf("{"), b = js.lastIndexOf("}");
    if (a === -1 || b === -1) return NextResponse.json({ error: "Could not parse response" }, { status: 502 });
    const parsed = JSON.parse(js.slice(a, b + 1));
    const validIds = new Set(voices.map((v: any) => v.id));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.assignments || {})) if (typeof v === "string" && validIds.has(v)) out[k] = v;
    return NextResponse.json({ assignments: out });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
