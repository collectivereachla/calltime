// Verbatim-preserving, best-effort theatrical script parser.
// Keeps every line's text exactly as written; only infers structure
// (act/scene, speaker, dialogue vs stage direction) around it.
export type ParsedLine = {
  n: number; act: number; scene: number; type: string; character: string | null; content: string;
};

function romanOrNum(token: string): number {
  const t = token.trim().toUpperCase();
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
  const map: Record<string, number> = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12 };
  return map[t] || 1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A new speaker can start mid-line when the source ran turns together.
// Split dialogue content on inline ALL-CAPS character names (case-sensitive, so
// ordinary words like "all"/"duke" are never touched), using the cast list
// learned from the line-start cues.
function splitInlineSpeakers(lines: ParsedLine[]): ParsedLine[] {
  const cast = Array.from(
    new Set(lines.filter((l) => l.character).map((l) => l.character!.trim().toUpperCase()))
  ).filter((nm) => nm.length >= 2);
  if (cast.length === 0) return lines;
  const alt = cast.sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const boundary = new RegExp(`(^|\\s)(${alt})(?=\\s|$|[.,!?;:])`, "g");
  const lead = new RegExp(`^(${alt})[\\s.:,;-]*(.*)$`);
  const SEP = String.fromCharCode(1);
  const out: ParsedLine[] = [];
  for (const l of lines) {
    if ((l.type !== "dialogue" && l.type !== "lyric") || !l.content) { out.push(l); continue; }
    const marked = l.content.replace(boundary, (_m, pre: string, name: string) => pre + SEP + name);
    if (!marked.includes(SEP)) { out.push(l); continue; }
    const parts = marked.split(SEP);
    const first = parts[0].trim();
    if (first) out.push({ ...l, content: first });
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i];
      const mm = seg.match(lead);
      if (mm && mm[2].trim()) out.push({ ...l, type: "dialogue", character: mm[1], content: mm[2].trim() });
      else if (seg.trim()) out.push({ ...l, content: seg.trim() });
    }
  }
  return out;
}

export function parseScriptText(raw: string): ParsedLine[] {
  const pre: ParsedLine[] = [];
  let act = 1, scene = 1;
  let currentChar: string | null = null;
  const rows = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const row of rows) {
    const line = row.replace(/\s+$/g, "");
    const t = line.trim();
    if (t === "") { currentChar = null; continue; }

    let m: RegExpMatchArray | null;
    if ((m = t.match(/^ACT\s+([0-9IVXLC]+)\b/i))) {
      act = romanOrNum(m[1]); scene = 1; currentChar = null;
      pre.push({ n: 0, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if ((m = t.match(/^SCENE\s+([0-9IVXLC]+)\b/i))) {
      scene = romanOrNum(m[1]); currentChar = null;
      pre.push({ n: 0, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if (/^[([].*[)\]]$/.test(t)) {
      pre.push({ n: 0, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if ((m = t.match(/^([A-Z][A-Z0-9 .'&/-]{0,28}[A-Z0-9.)])\s*[:.]\s*(.*)$/))) {
      const name = m[1].trim();
      currentChar = name;
      pre.push({ n: 0, act, scene, type: "dialogue", character: name, content: m[2] });
      continue;
    }
    if (currentChar) pre.push({ n: 0, act, scene, type: "dialogue", character: currentChar, content: line });
    else pre.push({ n: 0, act, scene, type: "stage_direction", character: null, content: line });
  }

  const split = splitInlineSpeakers(pre);
  return split.map((l, i) => ({ ...l, n: i + 1 }));
}
