"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgTimezone } from "./actions";

const ZONES: { v: string; label: string }[] = [
  { v: "America/New_York", label: "Eastern (New York)" },
  { v: "America/Chicago", label: "Central (Chicago)" },
  { v: "America/Denver", label: "Mountain (Denver)" },
  { v: "America/Phoenix", label: "Mountain, no DST (Phoenix)" },
  { v: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { v: "America/Anchorage", label: "Alaska (Anchorage)" },
  { v: "Pacific/Honolulu", label: "Hawaiʻi (Honolulu)" },
];

export function TimezoneSetting({ orgId, current }: { orgId: string; current: string | null }) {
  const router = useRouter();
  const known = current && ZONES.some((z) => z.v === current) ? current : "America/Chicago";
  const [tz, setTz] = useState(known);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save(next: string) {
    const prev = tz;
    setTz(next);
    setSaving(true);
    setStatus(null);
    const r = await setOrgTimezone(orgId, next);
    setSaving(false);
    if (r?.error) { setStatus(r.error); setTz(prev); return; }
    setStatus("Saved");
    router.refresh();
  }

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-1">Time zone</h2>
      <p className="text-body-xs text-ash mb-3">
        Call times, the callboard, check-in, and your calendar feed display in this zone.
        Set it to where your company works. Defaults to Central.
      </p>
      <div className="bg-card border border-bone rounded-card p-5 flex items-center gap-3 flex-wrap">
        <select
          value={tz}
          onChange={(e) => save(e.target.value)}
          disabled={saving}
          className="px-3 py-2 text-body-sm bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none disabled:opacity-50"
        >
          {ZONES.map((z) => <option key={z.v} value={z.v}>{z.label}</option>)}
        </select>
        {status && <span className="text-body-xs text-ash">{status}</span>}
      </div>
    </section>
  );
}
