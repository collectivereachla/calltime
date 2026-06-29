import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";

export const maxDuration = 30;

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
  const text: string = typeof body.text === "string" ? body.text.slice(0, 2000).trim() : "";
  if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

  const prompt = `Rewrite the following lines in plain, modern English — a direct, literal translation of what is being said, sentence for sentence, in today's words. Same meaning and roughly the same length. Do NOT add interpretation, subtext, meaning, analysis, acting or stage notes, or commentary of any kind. Just the words in modern English. Respond with ONLY raw JSON, no markdown: {"translation":"..."}.

LINES:
${text}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { const e = await r.text(); return NextResponse.json({ error: `Anthropic error ${r.status}: ${e.slice(0, 160)}` }, { status: 502 }); }
    const data = await r.json();
    const raw = (data.content?.[0]?.text || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    if (a !== -1 && b !== -1) {
      try { const j = JSON.parse(raw.slice(a, b + 1)); if (j.translation) return NextResponse.json({ translation: String(j.translation) }); } catch {}
    }
    // fallback: use the raw text if JSON failed
    return NextResponse.json({ translation: raw.slice(0, 600) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
