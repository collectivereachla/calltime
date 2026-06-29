"use client";

import { useState } from "react";
import { setFinanceAccess } from "./finance-actions";

type Member = { id: string; name: string; role: string; finance: boolean };

export function FinanceAccess({ orgId, members }: { orgId: string; members: Member[] }) {
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(members.map((m) => [m.id, m.finance])));
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(m: Member) {
    if (m.role === "owner") return;
    const next = !state[m.id];
    setBusy(m.id);
    setState((s) => ({ ...s, [m.id]: next }));
    const res = await setFinanceAccess(m.id, orgId, next);
    if (res?.error) setState((s) => ({ ...s, [m.id]: !next })); // revert on failure
    setBusy(null);
  }

  return (
    <div className="mt-10 pt-8 border-t border-bone">
      <h3 className="font-display text-display-sm mb-1">Finance access</h3>
      <p className="text-body-sm text-ash mb-3">Who can open the Ledger &mdash; budget, invoices, receipts, contracts, payers. Owners always have it; grant it to a producer or treasurer without making them an owner. They still never see the donor Rolodex.</p>
      <div className="border border-bone rounded-card divide-y divide-bone">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-body-sm text-ink">{m.name}{m.role === "owner" && <span className="text-body-xs text-muted"> &middot; owner</span>}</span>
            {m.role === "owner" ? (
              <span className="text-body-xs text-confirmed">Always</span>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-body-xs text-muted">{state[m.id] ? "Has access" : "No access"}</span>
                <input type="checkbox" checked={!!state[m.id]} disabled={busy === m.id} onChange={() => toggle(m)} className="rounded border-bone text-brick focus:ring-brick" />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
