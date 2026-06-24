"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgHideAi } from "./actions";

export function AiFeatures({ orgId, hidden }: { orgId: string; hidden: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(hidden);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    setStatus(null);
    const r = await setOrgHideAi(orgId, next);
    setSaving(false);
    if (r?.error) { setStatus(r.error); setOn(!next); return; }
    router.refresh();
  }

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-1">AI features</h2>
      <p className="text-body-xs text-ash mb-3">
        Calltime is a production-management tool, not an AI product. The one optional
        AI helper is a verse coach in Line Lab that scans classical text for meter.
        Turn it off entirely for your whole company here.
      </p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <button onClick={toggle} disabled={saving}
          className={`px-3 py-1.5 text-body-xs font-medium rounded-card border transition-colors disabled:opacity-50 ${
            on ? "bg-bone/30 border-bone text-muted" : "bg-confirmed/10 border-confirmed/30 text-confirmed"
          }`}>
          {on ? "AI features hidden" : "AI features on"}
        </button>
        <span className="text-body-xs text-ash">
          {on ? "No AI features appear anywhere in your company." : "The optional verse coach is available in Line Lab."}
        </span>
        {status && <span className="text-body-xs text-brick w-full">{status}</span>}
      </div>
    </section>
  );
}
