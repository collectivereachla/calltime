"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgAccentColor } from "./actions";
import { extractDominantColor } from "@/lib/extract-color";

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
      const hex = await extractDominantColor(logoUrl);
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
