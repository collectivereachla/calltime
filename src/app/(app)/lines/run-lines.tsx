"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type Line = {
  line_number: number;
  act: number | null;
  scene: number | null;
  line_type: string;
  character: string | null;
  content: string;
};

const SPEAKABLE = new Set(["dialogue", "lyric"]);

const CLOUD_VOICES = [
  // Female (Google Chirp 3: HD)
  { id: "en-US-Chirp3-HD-Aoede", label: "Aoede — bright", gender: "F", desc: "female, bright, expressive" },
  { id: "en-US-Chirp3-HD-Kore", label: "Kore — warm", gender: "F", desc: "female, warm, grounded" },
  { id: "en-US-Chirp3-HD-Leda", label: "Leda — youthful", gender: "F", desc: "female, youthful, light" },
  { id: "en-US-Chirp3-HD-Zephyr", label: "Zephyr — airy", gender: "F", desc: "female, airy, gentle" },
  { id: "en-US-Chirp3-HD-Achernar", label: "Achernar", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Autonoe", label: "Autonoe", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Callirrhoe", label: "Callirrhoe", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Despina", label: "Despina", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Erinome", label: "Erinome", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Gacrux", label: "Gacrux", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Laomedeia", label: "Laomedeia", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Pulcherrima", label: "Pulcherrima", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Sulafat", label: "Sulafat", gender: "F", desc: "female" },
  { id: "en-US-Chirp3-HD-Vindemiatrix", label: "Vindemiatrix", gender: "F", desc: "female" },
  // Male
  { id: "en-US-Chirp3-HD-Charon", label: "Charon — deep", gender: "M", desc: "male, deep, authoritative" },
  { id: "en-US-Chirp3-HD-Fenrir", label: "Fenrir — gravel", gender: "M", desc: "male, gravelly, rough-edged" },
  { id: "en-US-Chirp3-HD-Orus", label: "Orus — firm", gender: "M", desc: "male, firm, steady" },
  { id: "en-US-Chirp3-HD-Puck", label: "Puck — lively", gender: "M", desc: "male, young, playful" },
  { id: "en-US-Chirp3-HD-Achird", label: "Achird", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Algenib", label: "Algenib", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Algieba", label: "Algieba", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Alnilam", label: "Alnilam", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Enceladus", label: "Enceladus", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Iapetus", label: "Iapetus", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Rasalgethi", label: "Rasalgethi", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Sadachbia", label: "Sadachbia", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Sadaltager", label: "Sadaltager", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Schedar", label: "Schedar", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Umbriel", label: "Umbriel", gender: "M", desc: "male" },
  { id: "en-US-Chirp3-HD-Zubenelgenubi", label: "Zubenelgenubi", gender: "M", desc: "male" },
];
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function autoVoiceId(name: string) { return CLOUD_VOICES[hashStr(name.toLowerCase()) % CLOUD_VOICES.length].id; }
function autoVoiceLabel(name: string) { const id = autoVoiceId(name); return (CLOUD_VOICES.find((v) => v.id === id) || CLOUD_VOICES[0]).label; }

const SMALLNUM = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"];
const FILLERS = new Set(["um","uh","er","ah","hmm"]);
function expand(s: string) {
  let t = s.toLowerCase().replace(/&/g, " and ");
  t = t.replace(/won't/g, "will not").replace(/can't/g, "cannot").replace(/n't/g, " not")
       .replace(/'re/g, " are").replace(/'ve/g, " have").replace(/'ll/g, " will")
       .replace(/'d/g, " would").replace(/'m/g, " am").replace(/let's/g, "let us").replace(/'s/g, " is");
  t = t.replace(/\b\d+\b/g, (m) => { const n = parseInt(m, 10); return n >= 0 && n <= 20 ? SMALLNUM[n] : m; });
  return t;
}
function normalize(s: string) {
  let t = expand(s).replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return t.split(" ").filter((w) => w && !FILLERS.has(w)).join(" ");
}
function tokens(s: string) { const n = normalize(s); return n ? n.split(" ") : []; }
function cleanForSpeech(s: string) {
  return s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/[♪♫*_]/g, " ").replace(/\s+/g, " ").trim();
}
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (x.length === 0 && y.length === 0) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[x.length][y.length] / Math.max(x.length, y.length);
}
function coverage(target: string, said: string) {
  const t = tokens(target), s = tokens(said);
  if (t.length === 0) return said.trim() ? 0 : 1;
  const bag = new Map<string, number>();
  for (const w of s) bag.set(w, (bag.get(w) || 0) + 1);
  let hit = 0;
  for (const w of t) { const c = bag.get(w) || 0; if (c > 0) { hit++; bag.set(w, c - 1); } }
  return hit / t.length;
}
function syllables(word: string) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  w = w.replace(/e\b/, "");
  const m = w.match(/[aeiouy]+/g);
  return Math.max(1, m ? m.length : 1);
}
function countSyllables(text: string) {
  return text.split(/\s+/).filter(Boolean).reduce((a, w) => a + syllables(w), 0);
}
// Split a flattened speech into verse-ish lines (~10 syllables, breaking at clause ends).
function lineate(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [], syl = 0;
  for (const w of words) {
    cur.push(w); syl += syllables(w);
    const clause = /[.,;:!?—]$/.test(w);
    if (syl >= 10 || (syl >= 7 && clause)) { out.push(cur.join(" ")); cur = []; syl = 0; }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
function Marks({ text }: { text: string }) {
  const n = countSyllables(text);
  const marks = Array.from({ length: Math.max(n, 1) }, (_, i) => (i % 2 === 0 ? "˘" : "´")).join(" ");
  return (
    <p className="font-mono text-[11px] text-muted mt-0.5">
      <span className="tracking-[0.3em]">{marks}</span>
      <span className="ml-2">({n}{n === 10 ? " · pentameter" : ""})</span>
    </p>
  );
}

type Item = Line & { idx: number; mine: boolean; speakable: boolean };

export function RunLines({ scriptTitle, lines, suggestedCharacter }: { scriptTitle: string; lines: Line[]; suggestedCharacter: string | null }) {
  const characters = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (SPEAKABLE.has(l.line_type) && l.character) {
      const c = l.character.trim(); if (c) m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [lines]);

  const scenes = useMemo(() => {
    const seen = new Set<string>(); const out: { act: number | null; scene: number | null; key: string }[] = [];
    for (const l of lines) { const key = `${l.act ?? "-"}.${l.scene ?? "-"}`; if (!seen.has(key)) { seen.add(key); out.push({ act: l.act, scene: l.scene, key }); } }
    return out;
  }, [lines]);

  const [character, setCharacter] = useState<string>("");
  const [sceneKey, setSceneKey] = useState<string>("all");
  const [phase, setPhase] = useState<"setup" | "run">("setup");
  const [autoRead, setAutoRead] = useState(true);
  const [rate, setRate] = useState(0.95);
  const [strictness, setStrictness] = useState(0.6);
  const [scansion, setScansion] = useState(false);
  const [scanData, setScanData] = useState<Record<string, { scansion: string; syllable_count: number; meter: string; is_regular: boolean; note: string }>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("cloud:en-US-Chirp3-HD-Charon");
  const [castVoices, setCastVoices] = useState<Record<string, string>>({});
  const [autoCasting, setAutoCasting] = useState(false);
  const [castMsg, setCastMsg] = useState("");

  const supported = typeof window !== "undefined" && (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));

  useEffect(() => {
    if (!suggestedCharacter || character) return;
    const hit = characters.find((c) => c.name.toLowerCase() === suggestedCharacter.toLowerCase());
    if (hit) setCharacter(hit.name);
  }, [suggestedCharacter, characters, character]);

  useEffect(() => { try { const r = localStorage.getItem("ct_cast_voices"); if (r) setCastVoices(JSON.parse(r)); } catch {} }, []);

  function setCast(name: string, id: string) {
    setCastVoices((prev) => { const n = { ...prev }; if (id) n[name] = id; else delete n[name]; try { localStorage.setItem("ct_cast_voices", JSON.stringify(n)); } catch {} return n; });
  }
  const charVoiceURI = (name: string) => `cloud:${castVoices[name] || autoVoiceId(name)}`;

  async function autoCast() {
    setAutoCasting(true); setCastMsg("");
    try {
      const cues = characters.filter((c) => c.name !== character);
      const sample = new Map<string, string>();
      for (const l of lines) {
        if (!SPEAKABLE.has(l.line_type) || !l.character) continue;
        const nm = l.character.trim();
        if (!cues.some((c) => c.name === nm)) continue;
        const cur = sample.get(nm) || "";
        if (cur.length < 220) sample.set(nm, (cur + " " + cleanForSpeech(l.content)).trim());
      }
      const payload = {
        characters: cues.map((c) => ({ name: c.name, sample: sample.get(c.name) || "" })),
        voices: CLOUD_VOICES.map((v) => ({ id: v.id, desc: v.desc })),
      };
      const res = await fetch("/api/cast-voices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.assignments) { setCastMsg(data.error || "Couldn't auto-cast."); return; }
      const merged = { ...castVoices, ...data.assignments };
      setCastVoices(merged);
      try { localStorage.setItem("ct_cast_voices", JSON.stringify(merged)); } catch {}
      setCastMsg(`Cast ${Object.keys(data.assignments).length} roles to fitting voices.`);
    } catch { setCastMsg("Couldn't auto-cast."); }
    finally { setAutoCasting(false); }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => /en(-|_|$)/i.test(v.lang));
      setVoices(all);
      setVoiceURI((cur) => {
        let saved = ""; try { saved = localStorage.getItem("ct_tts_voice") || ""; } catch {}
        if (saved) return saved;
        return cur || "cloud:en-US-Chirp3-HD-Charon";
      });
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch {} };
  }, []);

  const seq = useMemo<Item[]>(() => {
    let ls = lines;
    if (sceneKey !== "all") ls = lines.filter((l) => `${l.act ?? "-"}.${l.scene ?? "-"}` === sceneKey);
    return ls.map((l, i) => {
      const speakable = SPEAKABLE.has(l.line_type);
      const mine = speakable && !!character && (l.character || "").trim().toLowerCase() === character.toLowerCase();
      return { ...l, idx: i, mine, speakable };
    });
  }, [lines, sceneKey, character]);

  const myCount = useMemo(() => seq.filter((s) => s.mine).length, [seq]);

  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<null | { pass: boolean; score: number; said: string }>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, attempts: 0 });

  const recogRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const settingsRef = useRef({ strictness, autoRead, rate });
  settingsRef.current = { strictness, autoRead, rate };
  const voiceRef = useRef<{ uri: string; list: SpeechSynthesisVoice[] }>({ uri: "", list: [] });
  voiceRef.current = { uri: voiceURI, list: voices };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cloudCacheRef = useRef<Map<string, string>>(new Map());
  const sbRef = useRef(createClient());
  const scanInFlight = useRef<Set<string>>(new Set());

  const stopAll = useCallback(() => {
    cancelRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch {}
    try { recogRef.current?.abort?.(); } catch {}
    try { audioRef.current?.pause(); } catch {}
    setListening(false);
  }, []);

  const browserSpeak = useCallback((text: string, rate: number, uri?: string) => {
    return new Promise<void>((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        const useUri = uri ?? voiceRef.current.uri;
        const chosen = voiceRef.current.list.find((v) => v.voiceURI === useUri);
        if (chosen) u.voice = chosen;
        u.onend = () => resolve(); u.onerror = () => resolve();
        synth.speak(u);
      } catch { resolve(); }
    });
  }, []);

  const cloudSpeak = useCallback(async (text: string, voiceName: string, rate: number): Promise<boolean> => {
    try {
      const ck = `${voiceName}|${rate}|${text}`;
      let url = cloudCacheRef.current.get(ck);
      if (!url) {
        const { data, error } = await sbRef.current.functions.invoke("tts", { body: { text, voice: voiceName, rate } });
        const d = data as { url?: string; capped?: boolean } | null;
        if (error || !d || d.capped || !d.url) return false;
        url = d.url; cloudCacheRef.current.set(ck, url);
      }
      return await new Promise<boolean>((resolve) => {
        try {
          audioRef.current?.pause();
          const a = new Audio(url!); audioRef.current = a;
          a.onended = () => resolve(true); a.onerror = () => resolve(false);
          a.play().catch(() => resolve(false));
        } catch { resolve(false); }
      });
    } catch { return false; }
  }, []);

  const speak = useCallback(async (text: string, opts?: { rate?: number; voiceURI?: string }) => {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const rate = opts?.rate ?? settingsRef.current.rate;
    const v = opts?.voiceURI ?? voiceRef.current.uri;
    if (v.startsWith("cloud:")) { const ok = await cloudSpeak(clean, v.slice(6), rate); if (ok) return; }
    await browserSpeak(clean, rate, v);
  }, [cloudSpeak, browserSpeak]);

  const sayWord = useCallback((w: string) => {
    try { window.speechSynthesis?.cancel(); } catch {}
    speak(w.replace(/[^\p{L}\p{N}'\-]/gu, ""), { rate: 0.6 });
  }, [speak]);

  const next = useCallback(() => { setResult(null); setRevealed(false); setHeard(""); setIndex((i) => i + 1); }, []);

  const evaluate = useCallback((saidRaw: string, target: string) => {
    const s = Math.max(similarity(target, saidRaw), coverage(target, saidRaw) * 0.97);
    const pass = s >= settingsRef.current.strictness;
    setResult({ pass, score: s, said: saidRaw });
    setScore((sc) => ({ correct: sc.correct + (pass ? 1 : 0), attempts: sc.attempts + 1 }));
    if (pass) setTimeout(() => { if (!cancelRef.current) next(); }, 700);
  }, [next]);

  const listen = useCallback((target: string) => {
    if (!supported) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    try { recogRef.current?.abort?.(); } catch {}
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + " "; else interim += res[0].transcript;
      }
      setHeard((finalText + interim).trim());
    };
    r.onend = () => { setListening(false); const said = finalText.trim(); if (said) evaluate(said, target); };
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setHeard(""); setResult(null);
    try { r.start(); setListening(true); } catch {}
  }, [supported, evaluate]);

  useEffect(() => {
    if (phase !== "run") return;
    cancelRef.current = false;
    const item = seq[index];
    if (!item) return;
    (async () => {
      if (item.mine) {
        if (supported && settingsRef.current.autoRead) listen(item.content);
      } else if (item.speakable) {
        if (settingsRef.current.autoRead) { await speak(item.content, { voiceURI: charVoiceURI(item.character || "") }); if (!cancelRef.current) setTimeout(() => { if (!cancelRef.current) next(); }, 150); }
      } else {
        await new Promise((res) => setTimeout(res, 1100));
        if (!cancelRef.current) next();
      }
    })();
    return () => { cancelRef.current = true; try { window.speechSynthesis?.cancel(); } catch {} try { recogRef.current?.abort?.(); } catch {} try { audioRef.current?.pause(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, seq]);

  // Accurate scansion via Claude (/api/verse-coach), cached per line; heuristic shown until it lands.
  useEffect(() => {
    if (!scansion || phase !== "run") return;
    const item = seq[index];
    if (!item || !item.speakable) return;
    const lns = lineate(item.content);
    const missing = lns.filter((l) => !scanData[l] && !scanInFlight.current.has(l));
    if (missing.length === 0) return;
    missing.forEach((l) => scanInFlight.current.add(l));
    (async () => {
      try {
        const res = await fetch("/api/verse-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: missing.join("\n") }) });
        const data = await res.json();
        if (res.ok && Array.isArray(data.lines)) {
          setScanData((prev) => {
            const n = { ...prev };
            data.lines.forEach((ln: { scansion?: string; syllable_count?: number; meter?: string; is_regular?: boolean; note?: string }, i: number) => {
              const key = missing[i];
              if (key) n[key] = { scansion: ln.scansion || "", syllable_count: ln.syllable_count || 0, meter: ln.meter || "", is_regular: ln.is_regular !== false, note: ln.note || "" };
            });
            return n;
          });
        }
      } catch {}
      finally { missing.forEach((l) => scanInFlight.current.delete(l)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scansion, index, phase, seq, scanData]);

  function start() {
    if (!character) return;
    setIndex(0); setScore({ correct: 0, attempts: 0 }); setResult(null); setRevealed(false); setHeard("");
    setPhase("run");
  }
  function quit() { stopAll(); setPhase("setup"); }

  function Passage({ text, variant, scansionOn }: { text: string; variant: "mine" | "cue" | "context"; scansionOn: boolean }) {
    const ls = lineate(text);
    const cls = variant === "mine" ? "text-display-sm font-display text-ink leading-snug"
      : variant === "context" ? "text-body-sm text-muted italic leading-snug"
      : "text-body-lg text-ink leading-snug";
    return (
      <div className="space-y-1.5">
        {ls.map((ln, i) => (
          <div key={i}>
            <p className={cls}>
              {ln.split(/(\s+)/).map((tok, j) => /\s+/.test(tok) ? tok : (
                <button key={j} type="button" onClick={() => sayWord(tok)} title="Tap to hear it" className="hover:text-brick hover:underline decoration-dotted underline-offset-2 transition-colors">{tok}</button>
              ))}
            </p>
            {scansionOn && variant !== "context" && (() => {
              const sd = scanData[ln];
              if (sd && sd.scansion) return (
                <p className="font-mono text-[11px] text-muted mt-0.5">
                  <span className="tracking-[0.2em]">{sd.scansion}</span>
                  <span className="ml-2">{sd.syllable_count} syl{sd.meter ? ` · ${sd.meter}` : ""}</span>
                  {!sd.is_regular && sd.note && <span className="block text-tentative mt-0.5">{sd.note}</span>}
                </p>
              );
              return <Marks text={ln} />;
            })()}
          </div>
        ))}
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8">
        <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Run Lines</p>
        <h1 className="font-display text-display-lg text-ink leading-none mb-1">{scriptTitle}</h1>
        <p className="text-body-sm text-ash mb-6">Pick your role, then run the scene out loud. It reads everyone else&rsquo;s cues; you speak your lines.</p>

        {characters.length === 0 ? (
          <p className="text-body-md text-ash">This script has no character-tagged lines yet, so there&rsquo;s nothing to run.</p>
        ) : (
          <>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Your role</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {characters.map((c) => (
                <button key={c.name} onClick={() => setCharacter(c.name)}
                  className={`text-left px-3 py-2 rounded-card border transition-colors ${character === c.name ? "border-brick bg-brick/5 text-ink" : "border-bone text-ink hover:border-ash"}`}>
                  <span className="text-body-sm font-medium block truncate">{c.name}</span>
                  <span className="text-body-xs text-muted font-mono">{c.count} lines</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-6">
              <label className="text-body-sm text-ink">
                <span className="text-body-xs text-muted uppercase tracking-wider block mb-1">Section</span>
                <select value={sceneKey} onChange={(e) => setSceneKey(e.target.value)} className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink">
                  <option value="all">Whole script</option>
                  {scenes.map((s) => (
                    <option key={s.key} value={s.key}>{s.act != null ? `Act ${s.act}` : "—"}{s.scene != null ? `, Scene ${s.scene}` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="text-body-sm text-ink">
                <span className="text-body-xs text-muted uppercase tracking-wider block mb-1">How close counts (loose → exact)</span>
                <input type="range" min={0.3} max={0.9} step={0.05} value={strictness} onChange={(e) => setStrictness(parseFloat(e.target.value))} className="accent-brick align-middle" />
                <span className="text-body-xs text-muted font-mono ml-2">{Math.round(strictness * 100)}%</span>
              </label>
            </div>

            <div className="mb-3">
              <span className="text-body-xs text-muted uppercase tracking-wider block mb-1">Reading voice</span>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={voiceURI} onChange={(e) => { setVoiceURI(e.target.value); try { localStorage.setItem("ct_tts_voice", e.target.value); } catch {} }} className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink max-w-xs">
                  <optgroup label="Natural — female">
                    {CLOUD_VOICES.filter((v) => v.gender === "F").map((v) => <option key={v.id} value={`cloud:${v.id}`}>{v.label}</option>)}
                  </optgroup>
                  <optgroup label="Natural — male">
                    {CLOUD_VOICES.filter((v) => v.gender === "M").map((v) => <option key={v.id} value={`cloud:${v.id}`}>{v.label}</option>)}
                  </optgroup>
                  {voices.length > 0 && (
                    <optgroup label="On this device">
                      {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <button type="button" onClick={() => speak("O, sir, content you. I follow him to serve my turn upon him.")} className="text-body-xs text-brick hover:underline">Preview</button>
              </div>
              <p className="text-body-xs text-muted mt-1.5 max-w-md">Used for your own lines on reveal. The Natural voices are studio-quality and cached, so repeats stay free.</p>
            </div>

            {character && characters.filter((c) => c.name !== character).length > 0 && (
              <div className="mb-6">
                <span className="text-body-xs text-muted uppercase tracking-wider block mb-1">Cast voices — who you hear</span>
                <p className="text-body-xs text-muted mb-2 max-w-md">Each role gets its own voice so a scene sounds like a scene. Auto-cast matches voices to each character (gender, age, temperament), or override any below.</p>
                <div className="flex items-center gap-3 mb-2">
                  <button type="button" onClick={autoCast} disabled={autoCasting} className="px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">{autoCasting ? "Casting…" : "✨ Auto-cast by character"}</button>
                  {castMsg && <span className="text-body-xs text-ash">{castMsg}</span>}
                </div>
                <div className="max-h-52 overflow-y-auto border border-bone rounded-card divide-y divide-bone">
                  {characters.filter((c) => c.name !== character).map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-body-sm text-ink truncate">{c.name}</span>
                      <select value={castVoices[c.name] || ""} onChange={(e) => setCast(c.name, e.target.value)} className="px-2 py-1 bg-paper border border-bone rounded-card text-body-xs text-ink shrink-0">
                        <option value="">Auto ({autoVoiceLabel(c.name)})</option>
                        <optgroup label="Female">{CLOUD_VOICES.filter((v) => v.gender === "F").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</optgroup>
                        <optgroup label="Male">{CLOUD_VOICES.filter((v) => v.gender === "M").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</optgroup>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-body-sm text-ink mb-3 cursor-pointer">
              <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} className="rounded border-bone text-brick focus:ring-brick" />
              Read cues aloud{supported ? " and listen for my lines" : ""}
            </label>
            <label className="flex items-center gap-2 text-body-sm text-ink mb-6 cursor-pointer">
              <input type="checkbox" checked={scansion} onChange={(e) => setScansion(e.target.checked)} className="rounded border-bone text-brick focus:ring-brick" />
              Show scansion (meter guide for verse / Shakespeare)
            </label>

            {!supported && (
              <p className="text-body-xs text-tentative bg-tentative/5 border border-tentative/20 rounded-card px-3 py-2 mb-6">
                Your browser can&rsquo;t do live speech recognition (Chrome works best). You can still run lines as flashcards: reveal, then mark whether you had it. Tap any word to hear it.
              </p>
            )}

            <button onClick={start} disabled={!character} className="px-5 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-40">
              Start{character ? ` as ${character}` : ""}
            </button>
            <p className="text-body-xs text-muted mt-3">Tip: tap any word to hear it pronounced slowly. Lines are auto-broken into verse-length lines (the script is stored as paragraphs), so the meter guide is approximate.</p>
          </>
        )}
      </div>
    );
  }

  const item = seq[index];
  const done = !item;
  const upcoming = seq.slice(index + 1).find((s) => s.speakable);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-body-xs text-muted uppercase tracking-wider">{character}{sceneKey !== "all" ? " · this section" : ""}</p>
          <p className="text-body-sm text-ash font-mono">{score.correct}/{score.attempts} hit{score.attempts === 1 ? "" : "s"} · {myCount} of your lines</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setScansion((v) => !v)} className={`text-body-sm transition-colors ${scansion ? "text-brick" : "text-muted hover:text-ink"}`}>Scansion</button>
          <button onClick={quit} className="text-body-sm text-muted hover:text-brick transition-colors">Done</button>
        </div>
      </div>

      {done ? (
        <div className="text-center py-16">
          <p className="font-display text-display-md text-ink mb-2">Scene complete</p>
          <p className="text-body-md text-ash mb-6">You nailed {score.correct} of {score.attempts} attempted.</p>
          <button onClick={start} className="px-5 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90">Run it again</button>
        </div>
      ) : item.mine ? (
        <div>
          <p className="text-body-xs text-brick uppercase tracking-wider mb-2 font-medium">Your line{item.act != null ? ` · Act ${item.act}${item.scene != null ? `, Sc ${item.scene}` : ""}` : ""}</p>
          <div className="bg-card border border-bone rounded-card p-5 min-h-[120px] flex flex-col justify-center">
            {revealed || (result && result.pass) ? (
              <Passage text={item.content} variant="mine" scansionOn={scansion} />
            ) : (
              <p className="text-body-md text-muted italic">{listening ? "Listening… say your line" : "Your line — say it out loud"}</p>
            )}
            {heard && !revealed && <p className="text-body-sm text-ash mt-3">heard: &ldquo;{heard}&rdquo;</p>}
          </div>

          {result && (
            <div className={`mt-3 text-body-sm rounded-card px-3 py-2 ${result.pass ? "bg-confirmed/10 text-confirmed" : "bg-tentative/10 text-tentative"}`}>
              {result.pass ? `✓ Got it (${Math.round(result.score * 100)}% match)` : `Close — ${Math.round(result.score * 100)}% match. Try again, or reveal.`}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {supported && (
              <button onClick={() => listen(item.content)} disabled={listening} className="px-4 py-2 bg-brick text-paper text-body-sm font-medium rounded-card hover:bg-brick/90 disabled:opacity-50">
                {listening ? "Listening…" : result ? "Try again" : "🎙 Speak"}
              </button>
            )}
            <button onClick={() => { setRevealed(true); if (window.speechSynthesis) speak(item.content); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">Reveal &amp; hear</button>
            <button onClick={() => { setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 })); next(); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">I had it</button>
            <button onClick={next} className="px-4 py-2 text-muted text-body-sm rounded-card hover:text-ink">Skip →</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">
            {item.speakable ? (item.character || "Cue") : (item.line_type === "stage_direction" ? "Stage direction" : item.line_type.replace(/_/g, " "))}
          </p>
          <div className={`rounded-card p-5 ${item.speakable ? "bg-card border border-bone" : "bg-bone/30"}`}>
            <Passage text={item.content} variant={item.speakable ? "cue" : "context"} scansionOn={scansion} />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { stopAll(); next(); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">Next →</button>
            {item.speakable && <button onClick={() => speak(item.content, { voiceURI: charVoiceURI(item.character || "") })} className="px-4 py-2 text-muted text-body-sm rounded-card hover:text-ink">🔊 Replay cue</button>}
          </div>
        </div>
      )}

      {upcoming && !done && (
        <p className="text-body-xs text-muted mt-8">Up next: <span className="font-medium">{upcoming.mine ? "you" : (upcoming.character || "cue")}</span></p>
      )}
    </div>
  );
}
