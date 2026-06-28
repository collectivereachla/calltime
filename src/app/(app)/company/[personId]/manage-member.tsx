"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeFromProduction, removeMember, banMember } from "../actions";

type Assignment = { productionId: string; title: string };

export function ManageMember({
  orgId,
  personId,
  personName,
  isOwner,
  isStaff,
  assignments,
}: {
  orgId: string;
  personId: string;
  personName: string;
  isOwner: boolean;
  isStaff: boolean;
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banning, setBanning] = useState(false);
  const [banReason, setBanReason] = useState("");

  if (!isStaff && !isOwner) return null;

  async function doRemoveFromProduction(productionId: string, title: string) {
    if (!confirm(`Remove ${personName} from ${title}? This takes them off this show and voids any pending or draft contracts. They stay in your company.`)) return;
    setBusy(true); setError(null);
    const r = await removeFromProduction(productionId, personId);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    router.refresh();
  }

  async function doRemoveFromOrg() {
    if (!confirm(`Remove ${personName} from this company? They come off your roster, but their account, profile, and history are preserved and untouched in any other company. This is not a ban.`)) return;
    setBusy(true); setError(null);
    const r = await removeMember(orgId, personId);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    router.push("/company");
  }

  async function doBan() {
    setBusy(true); setError(null);
    const r = await banMember(orgId, personId, banReason.trim() || undefined);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    router.push("/company");
  }

  if (!open) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setOpen(true)}
          className="text-body-xs text-muted hover:text-brick transition-colors"
        >
          Manage membership
        </button>
      </div>
    );
  }

  return (
    <div className="bg-paper border border-bone rounded-card p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-body-sm font-medium text-ink">Manage membership</p>
        <button onClick={() => setOpen(false)} className="text-body-xs text-muted hover:text-ink">Close</button>
      </div>

      {error && (
        <p className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2 mb-3">{error}</p>
      )}

      {isStaff && assignments.length > 0 && (
        <div className="mb-4">
          <p className="text-body-xs text-ash mb-2">No longer in a show? Remove them from just that production.</p>
          <div className="space-y-1.5">
            {assignments.map((a) => (
              <div key={a.productionId} className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-ink truncate">{a.title}</span>
                <button
                  onClick={() => doRemoveFromProduction(a.productionId, a.title)}
                  disabled={busy}
                  className="text-body-xs text-brick hover:underline shrink-0 disabled:opacity-50"
                >
                  Remove from production
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <div className="border-t border-bone pt-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body-sm text-ink">Remove from company</p>
              <p className="text-body-xs text-muted">Off your roster. Account and other companies untouched.</p>
            </div>
            <button onClick={doRemoveFromOrg} disabled={busy}
              className="text-body-xs text-brick hover:underline shrink-0 disabled:opacity-50">
              Remove
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="border-t border-bone pt-3">
          {!banning ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-sm text-ink">Ban from company</p>
                <p className="text-body-xs text-muted">Blocks them here until unbanned. Use for cause, not a normal departure.</p>
              </div>
              <button onClick={() => setBanning(true)} disabled={busy}
                className="text-body-xs text-brick hover:underline shrink-0 disabled:opacity-50">
                Ban
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-body-xs text-ash">
                Ban {personName} from this company? They lose access here and cannot be re-added until unbanned. Their account and any other companies are untouched.
              </p>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={doBan} disabled={busy}
                  className="px-4 py-1.5 bg-brick text-paper text-body-xs font-medium rounded-card hover:bg-brick/90 disabled:opacity-50">
                  {busy ? "Banning…" : "Ban"}
                </button>
                <button onClick={() => { setBanning(false); setBanReason(""); }}
                  className="px-3 py-1.5 text-body-xs text-ash hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
