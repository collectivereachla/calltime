"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

export type Line = {
  line_number: number;
  act: number | null;
  scene: number | null;
  line_type: string;
  character: string | null;
  content: string;
};

const SPEAKABLE = new Set(["dialogue", "lyric"]);

// ---- text helpers ----
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
function cleanForSpeech(s: string) {
  return s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/[♪♫*_]/g, " ").replace(/\s+/g, " ").trim();
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
function scan(text: string) {
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({ w, s: syllables(w) }));
  const count = words.reduce((a, b) => a + b.s, 0);
  return { words, count, pentameter: count === 10 };
}
function tokens(s: string) {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}
// word-level Levenshtein -> similarity 0..1
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (x.length === 0 && y.length === 0) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      dp[i][j] = x[i - 1] === y[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  const dist = dp[x.length][y.length];
  return 1 - dist / Math.max(x.length, y.length);
}

type Item = Line & { idx: number; mine: boolean; speakable: boolean };

export function RunLines({ scriptTitle, lines, suggestedCharacter }: { scriptTitle: string; lines: Line[]; suggestedCharacter: string | null }) {
  // ---- setup ----
  const characters = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (SPEAKABLE.has(l.line_type) && l.character) {
        const c = l.character.trim();
        if (c) m.set(c, (m.get(c) || 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [lines]);

  const scenes = useMemo(() => {
    const seen = new Set<string>();
    const out: { act: number | null; scene: number | null; key: string }[] = [];
    for (const l of lines) {
      const key = `${l.act ?? "-"}.${l.scene ?? "-"}`;
      if (!seen.has(key)) { seen.add(key); out.push({ act: l.act, scene: l.scene, key }); }
    }
    return out;
  }, [lines]);

  const [character, setCharacter] = useState<string>("");
  const [sceneKey, setSceneKey] = useState<string>("all");
  const [phase, setPhase] = useState<"setup" | "run">("setup");

  // settings
  const [autoRead, setAutoRead] = useState(true);
  const [rate, setRate] = useState(0.95);
  const [strictness, setStrictness] = useState(0.6);
  const [scansion, setScansion] = useState(false);

  const supported = typeof window !== "undefined" && (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));

  // suggested character preselect
  useEffect(() => {
    if (!suggestedCharacter || character) return;
    const hit = characters.find((c) => c.name.toLowerCase() === suggestedCharacter.toLowerCase());
    if (hit) setCharacter(hit.name);
  }, [suggestedCharacter, characters, character]);

  // ---- sequence ----
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

  // ---- run state ----
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");           // interim/last transcript
  const [result, setResult] = useState<null | { pass: boolean; score: number; said: string }>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, attempts: 0 });

  const recogRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const settingsRef = useRef({ strictness, autoRead, rate });
  settingsRef.current = { strictness, autoRead, rate };

  const stopAll = useCallback(() => {
    cancelRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch {}
    try { recogRef.current?.abort?.(); } catch {}
    setListening(false);
  }, []);

  const speak = useCallback((text: string, opts?: { rate?: number }) => {
    return new Promise<void>((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
        u.rate = opts?.rate ?? settingsRef.current.rate;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      } catch { resolve(); }
    });
  }, []);

  const sayWord = useCallback((w: string) => {
    try { window.speechSynthesis?.cancel(); } catch {}
    speak(w.replace(/[^\p{L}\p{N}'\-]/gu, ""), { rate: 0.6 });
  }, [speak]);

  const next = useCallback(() => {
    setResult(null); setRevealed(false); setHeard("");
    setIndex((i) => i + 1);
  }, []);

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
    r.lang = "en-US";
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setHeard((finalText + interim).trim());
    };
    r.onend = () => {
      setListening(false);
      const said = finalText.trim();
      if (said) evaluate(said, target);
    };
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setHeard(""); setResult(null);
    try { r.start(); setListening(true); } catch {}
  }, [supported, evaluate]);

  // drive the current step
  useEffect(() => {
    if (phase !== "run") return;
    cancelRef.current = false;
    const item = seq[index];
    if (!item) return; // finished
    (async () => {
      if (item.mine) {
        if (supported && settingsRef.current.autoRead) listen(item.content);
      } else if (item.speakable) {
        if (settingsRef.current.autoRead) {
          await speak(item.content);
          if (!cancelRef.current) setTimeout(() => { if (!cancelRef.current) next(); }, 150);
        }
      } else {
        // context line (stage direction, song title) — show briefly, advance
        await new Promise((res) => setTimeout(res, 1100));
        if (!cancelRef.current) next();
      }
    })();
    return () => { cancelRef.current = true; try { window.speechSynthesis?.cancel(); } catch {} try { recogRef.current?.abort?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, seq]);

  function start() {
    if (!character) return;
    setIndex(0); setScore({ correct: 0, attempts: 0 }); setResult(null); setRevealed(false); setHeard("");
    setPhase("run");
  }
  function quit() { stopAll(); setPhase("setup"); }

  function ScansionPanel({ text }: { text: string }) {
    const sc = scan(cleanForSpeech(text));
    const marks = Array.from({ length: Math.min(sc.count, 40) }, (_, i) => (i % 2 === 0 ? "\u02d8" : "\u00b4")).join(" ");
    return (
      <div className="mt-2 text-body-xs text-muted">
        <span className="font-mono tracking-widest">{marks}</span>
        <span className="ml-2">{sc.count} syllables{sc.pentameter ? " \u00b7 iambic pentameter" : ""} \u00b7 approx.</span>
      </div>
    );
  }

  // ---- render: word-by-word tappable line (pronunciation) ----
  function SpokenLine({ text, className = "" }: { text: string; className?: string }) {
    return (
      <p className={className}>
        {text.split(/(\s+)/).map((tok, i) =>
          /\s+/.test(tok) ? tok : (
            <button key={i} type="button" onClick={() => sayWord(tok)} title="Tap to hear it" className="hover:text-brick hover:underline decoration-dotted underline-offset-2 transition-colors">
              {tok}
            </button>
          )
        )}
      </p>
    );
  }

  // ======== SETUP ========
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

            <label className="flex items-center gap-2 text-body-sm text-ink mb-6 cursor-pointer">
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
            <p className="text-body-xs text-muted mt-3">Tip: tap any word — in a cue or your own line — to hear it pronounced slowly. Useful for names and Shakespeare.</p>
          </>
        )}
      </div>
    );
  }

  // ======== RUN ========
  const item = seq[index];
  const done = !item;
  const upcoming = seq.slice(index + 1).find((s) => s.speakable);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
      {/* header */}
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
        // ---- MY LINE ----
        <div>
          <p className="text-body-xs text-brick uppercase tracking-wider mb-2 font-medium">Your line{item.act != null ? ` · Act ${item.act}${item.scene != null ? `, Sc ${item.scene}` : ""}` : ""}</p>
          <div className="bg-card border border-bone rounded-card p-5 min-h-[120px] flex flex-col justify-center">
            {revealed || (result && result.pass) ? (
              <><SpokenLine text={item.content} className="text-display-sm font-display text-ink leading-snug" />{scansion && <ScansionPanel text={item.content} />}</>
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
            <button onClick={() => { setRevealed(true); window.speechSynthesis && speak(item.content); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">Reveal &amp; hear</button>
            <button onClick={() => { setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 })); next(); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">I had it</button>
            <button onClick={next} className="px-4 py-2 text-muted text-body-sm rounded-card hover:text-ink">Skip →</button>
          </div>
        </div>
      ) : (
        // ---- CUE / CONTEXT LINE ----
        <div>
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">
            {item.speakable ? (item.character || "Cue") : (item.line_type === "stage_direction" ? "Stage direction" : item.line_type.replace(/_/g, " "))}
          </p>
          <div className={`rounded-card p-5 ${item.speakable ? "bg-card border border-bone" : "bg-bone/30"}`}>
            <SpokenLine text={item.content} className={item.speakable ? "text-body-lg text-ink leading-snug" : "text-body-sm text-muted italic leading-snug"} />
            {scansion && item.speakable && <ScansionPanel text={item.content} />}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { stopAll(); next(); }} className="px-4 py-2 border border-bone text-ink text-body-sm rounded-card hover:border-ash">Next →</button>
            {item.speakable && <button onClick={() => speak(item.content)} className="px-4 py-2 text-muted text-body-sm rounded-card hover:text-ink">🔊 Replay cue</button>}
          </div>
        </div>
      )}

      {upcoming && !done && (
        <p className="text-body-xs text-muted mt-8">Up next: <span className="font-medium">{upcoming.mine ? "you" : (upcoming.character || "cue")}</span></p>
      )}
    </div>
  );
}
