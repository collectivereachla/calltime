"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setConflictLeadDays } from "./actions";

export function SchedulingPolicy({ orgId, leadDays }: { orgId: string; leadDays: number }) {
  const router = useRouter();
  const [val, setVal] = useState(leadDays);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save(n: number) {
    setVal(n); setSaving(true); setStatus(null);
    const r = await setConflictLeadDays(orgId, n);
    setSaving(false);
    if (r?.error) { setStatus(r.error); setVal(leadDays); return; }
    setStatus("Saved"); router.refresh();
  }

  return (
    <section className="mt-10 pt-8 border-t border-bone">
      <h3 className="font-display text-display-sm mb-1">Scheduling policy</h3>
      <p className="text-body-sm text-ash mb-3">How much notice the company needs for conflicts. Members can&rsquo;t log a new conflict inside this window &mdash; last-minute conflicts go through the stage manager. Mandatory calls stay protected regardless.</p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <span className="text-body-sm text-ink">Require conflicts at least</span>
        <select value={val} onChange={(e) => save(parseInt(e.target.value, 10))} disabled={saving} className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink">
          {[0, 3, 7, 10, 14, 21, 30].map((n) => <option key={n} value={n}>{n === 0 ? "No policy" : `${n} days`}</option>)}
        </select>
        <span className="text-body-sm text-ink">in advance</span>
        {status && <span className="text-body-xs text-muted ml-2">{status}</span>}
      </div>
    </section>
  );
}
