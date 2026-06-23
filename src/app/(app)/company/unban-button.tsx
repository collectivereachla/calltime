"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unbanMember } from "./actions";

export function UnbanButton({ orgId, personId }: { orgId: string; personId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnban() {
    setLoading(true);
    setError(null);
    const result = await unbanMember(orgId, personId);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handleUnban} disabled={loading}
        className="px-3 py-1 text-body-xs font-medium text-paper bg-ink rounded-card hover:bg-ink/90 disabled:opacity-50">
        {loading ? "..." : "Unban"}
      </button>
      {error && <span className="text-body-xs text-brick">{error}</span>}
    </div>
  );
}
