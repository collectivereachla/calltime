"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const RATINGS: { key: string; label: string }[] = [
  { key: "ease_schedule", label: "Calltime made it easy to know my call times and schedule." },
  { key: "ease_confirm", label: "Confirming a call or flagging a conflict was easy." },
  { key: "ease_invoice", label: "Submitting my invoice (and W-9, if I needed one) was easy." },
  { key: "ease_comms", label: "Staying in the loop — announcements and the Greenroom — worked for me." },
  { key: "ease_device", label: "Calltime worked well on the device I used most." },
  { key: "overall", label: "Overall, Calltime made being part of this production easier." },
];

export function ProductSurvey({ productionId, onDone }: { productionId: string; onDone: () => void }) {
  const [r, setR] = useState<Record<string, number>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [role, setRole] = useState("");
  const [device, setDevice] = useState("");
  const [confusing, setConfusing] = useState("");
  const [missing, setMissing] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const p_data: Record<string, unknown> = { ...r, nps, role, device, confusing, missing };
    const { data, error } = await supabase.rpc("submit_product_survey", { p_production: productionId, p_data });
    setBusy(false);
    const e = error?.message || (data as { error?: string } | null)?.error;
    if (e) { setErr(e); return; }
    onDone();
  }

  return (
    <div className="space-y-4">
      {RATINGS.map((q) => (
        <div key={q.key}>
          <p className="text-body-sm text-ink mb-1.5">{q.label}</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setR((s) => ({ ...s, [q.key]: n }))}
                className={`w-9 h-9 rounded-card border text-body-sm ${r[q.key] === n ? "bg-ink text-paper border-ink" : "border-bone text-ash hover:border-ash"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-body-xs text-muted">1 = Strongly disagree · 5 = Strongly agree</p>

      <div>
        <p className="text-body-sm text-ink mb-1.5">How likely are you to recommend Calltime to another theatre artist or company?</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNps(n)}
              className={`w-9 h-9 rounded-card border text-body-sm ${nps === n ? "bg-brick text-paper border-brick" : "border-bone text-ash hover:border-ash"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-body-xs text-muted mt-1">0 = Not at all · 10 = Extremely likely</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-body-xs text-muted block mb-1">My main role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
            <option value="">Select…</option>
            <option>Actor</option>
            <option>Crew</option>
            <option>Stage management</option>
            <option>Design</option>
            <option>Music</option>
            <option>Production leadership</option>
          </select>
        </div>
        <div>
          <label className="text-body-xs text-muted block mb-1">Mostly used on</label>
          <select value={device} onChange={(e) => setDevice(e.target.value)} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
            <option value="">Select…</option>
            <option>Phone</option>
            <option>Tablet</option>
            <option>Computer</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-body-xs text-muted block mb-1">What confused you or didn&apos;t work the way you expected?</label>
        <textarea value={confusing} onChange={(e) => setConfusing(e.target.value)} rows={2} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
      </div>
      <div>
        <label className="text-body-xs text-muted block mb-1">What is the one thing Calltime is missing that you wanted?</label>
        <textarea value={missing} onChange={(e) => setMissing(e.target.value)} rows={2} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
      </div>

      {err && <p className="text-body-sm text-brick">{err}</p>}
      <button onClick={submit} disabled={busy} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
        {busy ? "Sending…" : "Send feedback"}
      </button>
    </div>
  );
}
