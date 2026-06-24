"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgAccentColor } from "./actions";

export function BrandColor({ orgId, current }: { orgId: string; current: string | null }) {
  const router = useRouter();
  const [color, setColor] = useState(current || "#C4522D");
  const [saving, setSaving] = useState(false);
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

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-1">Brand color</h2>
      <p className="text-body-xs text-ash mb-3">
        The default accent for your programs — cover title and section headings.
        Individual playbills can override it.
      </p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 rounded border border-bone bg-paper p-0.5" />
        <span className="text-body-xs text-ash font-mono">{current || "house default (#C4522D)"}</span>
        <button onClick={() => save(color)} disabled={saving}
          className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
          Save
        </button>
        {current && (
          <button onClick={() => save(null)} disabled={saving} className="text-body-xs text-muted hover:text-brick">
            Reset to house color
          </button>
        )}
        {status && <span className="text-body-xs text-ash">{status}</span>}
      </div>
    </section>
  );
}
