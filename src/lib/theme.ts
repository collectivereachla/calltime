import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type ThemeTokens = {
  colors: Record<string, string>;
  fonts: { display: string; body: string; mono: string };
};

// Font name -> CSS font-family stack. Every font here is preloaded in globals.css.
export const FONT_STACKS: Record<string, string> = {
  "Newsreader": '"Newsreader", Georgia, serif',
  "Inter": '"Inter", system-ui, sans-serif',
  "JetBrains Mono": '"JetBrains Mono", monospace',
  "Tanker": '"Tanker", sans-serif',
  "Satoshi": '"Satoshi", system-ui, sans-serif',
  "General Sans": '"General Sans", system-ui, sans-serif',
  "Archivo": '"Archivo", system-ui, sans-serif',
  "Saira Condensed": '"Saira Condensed", sans-serif',
  "Oswald": '"Oswald", sans-serif',
  "Bebas Neue": '"Bebas Neue", sans-serif',
  "Anton": '"Anton", sans-serif',
  "Space Mono": '"Space Mono", monospace',
  "IBM Plex Mono": '"IBM Plex Mono", monospace',
  "Rozha One": '"Rozha One", Georgia, serif',
  "Fraunces": '"Fraunces", Georgia, serif',
};

export const DISPLAY_FONTS = ["Newsreader", "Fraunces", "Rozha One", "Tanker", "Anton", "Archivo", "Bebas Neue", "Oswald", "Saira Condensed"];
export const BODY_FONTS = ["Inter", "Satoshi", "General Sans", "Archivo"];
export const MONO_FONTS = ["JetBrains Mono", "Space Mono", "IBM Plex Mono"];

export const COLOR_KEYS = ["paper", "card", "ink", "brick", "ash", "bone", "muted", "confirmed", "tentative", "conflict"];

export const DEFAULT_THEME: ThemeTokens = {
  colors: { paper: "#FAF7F1", card: "#FFFFFF", ink: "#1A1A1B", brick: "#BC4F2B", ash: "#787068", bone: "#E8E1D2", muted: "#74706A", confirmed: "#1A6D4A", tentative: "#B5772A", conflict: "#C4522D" },
  fonts: { display: "Newsreader", body: "Inter", mono: "JetBrains Mono" },
};

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function fontStack(name: string) {
  return FONT_STACKS[name] || `"${name.replace(/["\\;{}]/g, "")}", sans-serif`;
}

const MODE_COOKIE = "calltime_mode";
// Tulia (dark) overrides only the neutrals; the brand accent + statuses + fonts
// carry over from the Àṣẹ theme so the two modes stay in the same family.
const TULIA_NEUTRALS: Record<string, string> = {
  paper: "#14181F", card: "#1E242E", ink: "#ECE7DD", ash: "#9AA0AC", bone: "#2C333F", muted: "#7F8794",
};
// In Tulia, the brand accent shifts from Apollo red to The Public's poster blue
// (the running-light glow of a dark house). Cue-light statuses stay as-is.
const TULIA_ACCENT: Record<string, string> = { brick: "#1E5BD6" };

export async function getMode(): Promise<"ase" | "tulia"> {
  try {
    const c = await cookies();
    return c.get(MODE_COOKIE)?.value === "tulia" ? "tulia" : "ase";
  } catch {
    return "ase";
  }
}

export function themeToCss(t: ThemeTokens, mode: "ase" | "tulia" = "ase"): string {
  const c = { ...(t.colors || {}) };
  if (mode === "tulia") Object.assign(c, TULIA_NEUTRALS, TULIA_ACCENT);
  const lines: string[] = [];
  for (const k of COLOR_KEYS) {
    const v = c[k];
    if (v && HEX.test(v)) lines.push(`--color-${k}:${v};`);
  }
  const f = t.fonts || DEFAULT_THEME.fonts;
  lines.push(`--font-display:${fontStack(f.display || "Newsreader")};`);
  lines.push(`--font-body:${fontStack(f.body || "Inter")};`);
  lines.push(`--font-mono:${fontStack(f.mono || "JetBrains Mono")};`);
  return `:root{${lines.join("")}}`;
}

export async function getTheme(): Promise<ThemeTokens> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("app_theme").select("tokens").eq("id", 1).maybeSingle();
    const t = (data?.tokens as ThemeTokens) || DEFAULT_THEME;
    return { colors: { ...DEFAULT_THEME.colors, ...(t.colors || {}) }, fonts: { ...DEFAULT_THEME.fonts, ...(t.fonts || {}) } };
  } catch {
    return DEFAULT_THEME;
  }
}
