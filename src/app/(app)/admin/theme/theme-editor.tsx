"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveTheme } from "./actions";

type Tokens = { colors: Record<string, string>; fonts: { display: string; body: string; mono: string } };

const STACKS: Record<string, string> = {
  "Newsreader": '"Newsreader", Georgia, serif', "Inter": '"Inter", system-ui, sans-serif',
  "JetBrains Mono": '"JetBrains Mono", monospace', "Tanker": '"Tanker", sans-serif',
  "Satoshi": '"Satoshi", system-ui, sans-serif', "General Sans": '"General Sans", system-ui, sans-serif',
  "Archivo": '"Archivo", system-ui, sans-serif', "Saira Condensed": '"Saira Condensed", sans-serif',
  "Oswald": '"Oswald", sans-serif', "Bebas Neue": '"Bebas Neue", sans-serif', "Anton": '"Anton", sans-serif',
  "Space Mono": '"Space Mono", monospace', "IBM Plex Mono": '"IBM Plex Mono", monospace',
  "Rozha One": '"Rozha One", Georgia, serif', "Fraunces": '"Fraunces", Georgia, serif',
};

const COLOR_LABELS: Record<string, string> = {
  paper: "Page background", card: "Card / surface", ink: "Text", brick: "Primary accent",
  ash: "Secondary text", bone: "Borders", muted: "Hints", confirmed: "GO (confirmed)",
  tentative: "STANDBY (pending)", conflict: "HOLD (conflict)",
};

const MARQUEE: Tokens = {
  colors: { paper: "#F4EFE4", card: "#FFFFFF", ink: "#0E0E0E", brick: "#E0301E", ash: "#6A6457", bone: "#E0DAC9", muted: "#8A8478", confirmed: "#138A5E", tentative: "#C8841E", conflict: "#C23B2E" },
  fonts: { display: "Tanker", body: "Satoshi", mono: "Space Mono" },
};
const CALLTIME_DEFAULT: Tokens = {
  colors: { paper: "#FAF7F1", card: "#FFFFFF", ink: "#1A1A1B", brick: "#BC4F2B", ash: "#787068", bone: "#E8E1D2", muted: "#74706A", confirmed: "#1A6D4A", tentative: "#B5772A", conflict: "#C4522D" },
  fonts: { display: "Newsreader", body: "Inter", mono: "JetBrains Mono" },
};

export function ThemeEditor({ initial, displayFonts, bodyFonts, monoFonts, colorKeys }: {
  initial: Tokens; displayFonts: string[]; bodyFonts: string[]; monoFonts: string[]; colorKeys: string[];
}) {
  const router = useRouter();
  const [colors, setColors] = useState<Record<string, string>>(initial.colors);
  const [fonts, setFonts] = useState(initial.fonts);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const applyColor = useCallback((k: string, v: string) => {
    setColors((c) => ({ ...c, [k]: v }));
    document.documentElement.style.setProperty(`--color-${k}`, v);
  }, []);
  const applyFont = useCallback((role: "display" | "body" | "mono", name: string) => {
    setFonts((f) => ({ ...f, [role]: name }));
    document.documentElement.style.setProperty(`--font-${role}`, STACKS[name] || `"${name}", sans-serif`);
  }, []);

  const applyPreset = (t: Tokens) => {
    for (const [k, v] of Object.entries(t.colors)) applyColor(k, v);
    applyFont("display", t.fonts.display); applyFont("body", t.fonts.body); applyFont("mono", t.fonts.mono);
  };

  async function save() {
    setSaving(true); setMsg(null);
    const r = await saveTheme({ colors, fonts });
    setSaving(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg("Saved — this is now live for everyone.");
    router.refresh();
  }

  const fontRow = (label: string, role: "display" | "body" | "mono", opts: string[]) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-body-sm text-ink">{label}</span>
      <select value={fonts[role]} onChange={(e) => applyFont(role, e.target.value)}
        className="px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <h1 className="font-display text-display-md text-ink mb-1">Appearance</h1>
      <p className="text-body-md text-ash mb-2">Tune Calltime&rsquo;s colors and fonts. Changes preview live for you here; <span className="font-medium text-ink">Save</span> makes them live for everyone.</p>
      <p className="text-body-xs text-muted mb-6">Platform admin only.</p>

      {msg && <p className="text-body-sm text-confirmed bg-confirmed/10 rounded-card px-3 py-2 mb-4">{msg}</p>}

      <div className="flex gap-2 mb-6">
        <button onClick={() => applyPreset(MARQUEE)} className="px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ash hover:text-ink hover:border-ash">Apply Marquee preset</button>
        <button onClick={() => applyPreset(CALLTIME_DEFAULT)} className="px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ash hover:text-ink hover:border-ash">Reset to current</button>
      </div>

      <h2 className="text-body-xs text-muted uppercase tracking-wider mb-2">Type</h2>
      <div className="bg-card border border-bone rounded-card px-4 divide-y divide-bone mb-8">
        {fontRow("Display (headlines)", "display", displayFonts)}
        {fontRow("Body (everything you read)", "body", bodyFonts)}
        {fontRow("Data (call times, cues)", "mono", monoFonts)}
      </div>

      <h2 className="text-body-xs text-muted uppercase tracking-wider mb-2">Color</h2>
      <div className="bg-card border border-bone rounded-card px-4 divide-y divide-bone mb-8">
        {colorKeys.map((k) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-body-sm text-ink">{COLOR_LABELS[k] || k}</span>
            <div className="flex items-center gap-2">
              <input type="color" value={colors[k] || "#000000"} onChange={(e) => applyColor(k, e.target.value)}
                className="w-8 h-8 rounded border border-bone bg-card cursor-pointer p-0" aria-label={`${k} color`} />
              <input type="text" value={colors[k] || ""} onChange={(e) => applyColor(k, e.target.value)}
                className="w-24 px-2 py-1.5 bg-card border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save — make it live"}
        </button>
        <button onClick={() => { applyPreset(initial); setMsg(null); }} className="text-body-sm text-ash hover:text-ink">Discard changes</button>
      </div>
    </div>
  );
}
