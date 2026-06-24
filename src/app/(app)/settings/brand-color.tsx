"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgAccentColor } from "./actions";

// Pull the dominant, vibrant color out of the org's logo, in-browser.
// Skips neutrals (grays) and near black/white; weights by saturation so the
// brand color wins over a large white/black background.
function extractFromLogo(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable."));
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try { data = ctx.getImageData(0, 0, size, size).data; }
      catch { return reject(new Error("Couldn't read the logo's pixels.")); }
      const bins = new Map<string, { score: number; r: number; g: number; b: number; n: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (r + g + b) / 3;
        if (sat < 0.25) continue;
        if (lum < 25 || lum > 235) continue;
        const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        const prev = bins.get(key) || { score: 0, r: 0, g: 0, b: 0, n: 0 };
        prev.score += sat; prev.r += r; prev.g += g; prev.b += b; prev.n++;
        bins.set(key, prev);
      }
      if (bins.size === 0) return reject(new Error("No strong color found in the logo."));
      let best: { score: number; r: number; g: number; b: number; n: number } | null = null;
      for (const v of bins.values()) if (!best || v.score > best.score) best = v;
      const r = Math.round(best!.r / best!.n), g = Math.round(best!.g / best!.n), b = Math.round(best!.b / best!.n);
      const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
      resolve(hex.toUpperCase());
    };
    img.onerror = () => reject(new Error("Couldn't load the logo image."));
    img.src = url;
  });
}

export function BrandColor({ orgId, current, logoUrl }: { orgId: string; current: string | null; logoUrl?: string | null }) {
  const router = useRouter();
  const [color, setColor] = useState(current || "#C4522D");
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save(next: string | null) {
    setSaving(true);
    setStatus(null);
    const r = await setOrgAccentColor(orgId, next);
    setSaving(false);
    if (r?.error) { setStatus(r.error); return; }
    setStatus("Saved.");
    router.refresh();
  }

  async function pullFromLogo() {
    if (!logoUrl) return;
    setPulling(true);
    setStatus(null);
    try {
      const hex = await extractFromLogo(logoUrl);
      setColor(hex);
      setStatus(`Pulled ${hex} from your logo — review it, then Save.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't read the logo.");
    } finally {
      setPulling(false);
    }
  }

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-1">Brand color</h2>
      <p className="text-body-xs text-ash mb-3">
        The default accent for your programs &mdash; cover title and section headings.
        Start it from your logo, then individual playbills can override it.
      </p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 rounded border border-bone bg-paper p-0.5" />
        <span className="text-body-xs text-ash font-mono">{current || "house default (#C4522D)"}</span>
        {logoUrl && (
          <button onClick={pullFromLogo} disabled={pulling}
            className="px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ink hover:border-ink transition-colors disabled:opacity-50">
            {pulling ? "Reading logo…" : "Pull from logo"}
          </button>
        )}
        <button onClick={() => save(color)} disabled={saving}
          className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
          Save
        </button>
        {current && (
          <button onClick={() => save(null)} disabled={saving} className="text-body-xs text-muted hover:text-brick">
            Reset to house color
          </button>
        )}
        {status && <span className="text-body-xs text-ash w-full">{status}</span>}
      </div>
    </section>
  );
}
