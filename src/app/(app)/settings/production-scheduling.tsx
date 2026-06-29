"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setProductionLeadDays } from "./actions";

export function ProductionScheduling({ productionId, title, current, orgDefault }: { productionId: string; title: string; current: number | null; orgDefault: number }) {
  const router = useRouter();
  const [val, setVal] = useState<string>(current === null ? "inherit" : String(current));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inheritLabel = orgDefault === 0 ? "no policy" : `${orgDefault} days`;

  async function save(v: string) {
    setVal(v); setSaving(true); setStatus(null);
    const days = v === "inherit" ? -1 : parseInt(v, 10);
    const r = await setProductionLeadDays(productionId, days);
    setSaving(false);
    if (r?.error) { setStatus(r.error); return; }
    setStatus("Saved"); router.refresh();
  }

  return (
    <section className="mt-10 pt-8 border-t border-bone">
      <h3 className="font-display text-display-sm mb-1">This show&rsquo;s scheduling</h3>
      <p className="text-body-sm text-ash mb-3">Override the conflict notice window for <span className="font-medium">{title}</span> only. Inherit uses the company default ({inheritLabel}).</p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <span className="text-body-sm text-ink">Require conflicts at least</span>
        <select value={val} onChange={(e) => save(e.target.value)} disabled={saving} className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink">
          <option value="inherit">Inherit ({inheritLabel})</option>
          {[0, 3, 7, 10, 14, 21, 30].map((n) => <option key={n} value={n}>{n === 0 ? "No policy" : `${n} days`}</option>)}
        </select>
        <span className="text-body-sm text-ink">in advance</span>
        {status && <span className="text-body-xs text-muted ml-2">{status}</span>}
      </div>
    </section>
  );
}
