import { NextResponse } from "next/server";

export const maxDuration = 30;

const PROMPT_PREFIX = `You are a Shakespeare verse coach. Analyze these lines for meter and meaning.

RESPOND WITH ONLY A RAW JSON OBJECT. No markdown, no backticks, no text before or after.

JSON structure:
{"lines":[{"original":"the line","scansion":"u / u / u / u / u /","feet":"iamb, iamb, iamb, iamb, iamb","meter":"iambic pentameter","syllable_count":10,"is_regular":true,"note":""}],"paraphrase":"Modern English actable intention","verse_or_prose":"verse","context_note":"Why verse/prose matters","acting_note":"Delivery guidance"}

scansion: u for unstressed, / for stressed, space-separated per syllable.
feet: iamb, trochee, spondee, pyrrhic — comma separated.
paraphrase: what the character is DOING with this language, not a word-for-word gloss.
note: explain any metrical irregularity and its dramatic purpose. Empty string if regular.
acting_note: where to breathe, what to punch, what to throw away.

Lines to analyze:
`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { text } = body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: PROMPT_PREFIX + text }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";

    // Extract JSON from response
    let jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const first = jsonStr.indexOf("{");
    const last = jsonStr.lastIndexOf("}");
    if (first === -1 || last === -1) {
      return NextResponse.json(
        { error: "Could not parse analysis" },
        { status: 502 }
      );
    }
    jsonStr = jsonStr.slice(first, last + 1);
    const analysis = JSON.parse(jsonStr);

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
