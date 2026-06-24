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

export function parseScriptText(raw: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let act = 1, scene = 1, n = 0;
  let currentChar: string | null = null;
  const rows = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const row of rows) {
    const line = row.replace(/\s+$/g, ""); // trim trailing whitespace only
    const t = line.trim();
    if (t === "") { currentChar = null; continue; } // blank line ends a speech

    let m: RegExpMatchArray | null;
    if ((m = t.match(/^ACT\s+([0-9IVXLC]+)\b/i))) {
      act = romanOrNum(m[1]); scene = 1; currentChar = null;
      out.push({ n: ++n, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if ((m = t.match(/^SCENE\s+([0-9IVXLC]+)\b/i))) {
      scene = romanOrNum(m[1]); currentChar = null;
      out.push({ n: ++n, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if (/^[([].*[)\]]$/.test(t)) {
      out.push({ n: ++n, act, scene, type: "stage_direction", character: null, content: line });
      continue;
    }
    if ((m = t.match(/^([A-Z][A-Z0-9 .'&/-]{0,28}[A-Z0-9.)])\s*[:.]\s*(.*)$/))) {
      const name = m[1].trim();
      const rest = m[2];
      currentChar = name;
      out.push({ n: ++n, act, scene, type: "dialogue", character: name, content: rest });
      continue;
    }
    if (currentChar) out.push({ n: ++n, act, scene, type: "dialogue", character: currentChar, content: line });
    else out.push({ n: ++n, act, scene, type: "stage_direction", character: null, content: line });
  }
  return out;
}
