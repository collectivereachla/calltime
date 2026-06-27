"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToRoleOffer } from "@/app/(app)/applications/actions";

export function RoleOfferCard({
  offerId, role, productionTitle, compensation, message,
}: {
  offerId: string;
  role: string;
  productionTitle: string;
  compensation: string | null;
  message: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(true); setErr(null);
    const r = await respondToRoleOffer(offerId, accept);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    router.refresh();
  }

  return (
    <div className="mb-8 bg-card border border-brick/30 rounded-card p-5">
      <p className="text-body-xs text-muted uppercase tracking-wider mb-1">You&rsquo;ve been offered a role</p>
      <h3 className="font-display text-display-sm text-ink">
        {role} <span className="text-ash font-normal text-body-md">· {productionTitle}</span>
      </h3>
      {compensation && <p className="text-body-sm text-ink mt-1">{compensation}</p>}
      {message && <p className="text-body-sm text-ash mt-2 whitespace-pre-wrap leading-relaxed">{message}</p>}
      {err && <p className="text-body-xs text-brick mt-2">{err}</p>}
      <div className="flex gap-3 mt-4">
        <button onClick={() => respond(true)} disabled={busy}
          className="px-4 py-2 text-body-sm font-medium rounded-card bg-confirmed text-paper hover:bg-confirmed/90 disabled:opacity-50">
          {busy ? "…" : "Accept"}
        </button>
        <button onClick={() => respond(false)} disabled={busy}
          className="px-4 py-2 text-body-sm rounded-card border border-bone text-ash hover:text-brick hover:border-brick disabled:opacity-50">
          Decline
        </button>
      </div>
    </div>
  );
}
