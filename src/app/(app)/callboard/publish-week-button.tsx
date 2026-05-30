"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishWeek } from "./actions";

export function PublishWeekButton({
  productionId,
  weekStart,
  count,
}: {
  productionId: string;
  weekStart: string;
  count: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    const res = await publishWeek(productionId, weekStart);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handle}
        disabled={busy}
        className="px-3 py-1.5 rounded-card text-body-xs font-medium bg-ink text-paper hover:bg-ink/90 disabled:opacity-50"
      >
        {busy ? "Publishing…" : `Publish ${count} call${count === 1 ? "" : "s"}`}
      </button>
      {error && <span className="text-body-xs text-brick">{error}</span>}
    </div>
  );
}
