"use client";

import { useState } from "react";
import { getW9SignedUrl } from "@/app/(app)/settings/w9-actions";

export function W9Download({ path, taxYear, submittedAt }: { path: string; taxYear: number | null; submittedAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true); setErr(null);
    const r = await getW9SignedUrl(path);
    setBusy(false);
    if (r.error || !r.url) { setErr(r.error || "Couldn't open the document."); return; }
    window.open(r.url, "_blank", "noopener");
  }

  return (
    <div className="bg-card border border-bone rounded-card p-4 mb-6">
      <p className="text-body-xs text-muted uppercase tracking-wider mb-1">W-9</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-ink">
          On file{taxYear ? ` for ${taxYear}` : ""}
          {submittedAt && <span className="text-muted"> · uploaded {new Date(submittedAt).toLocaleDateString()}</span>}
        </p>
        <button
          onClick={open}
          disabled={busy}
          className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50 shrink-0"
        >
          {busy ? "Opening…" : "View W-9"}
        </button>
      </div>
      {err && <p className="text-body-xs text-brick mt-1">{err}</p>}
    </div>
  );
}
