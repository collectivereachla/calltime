"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchMergeCandidates, mergeDuplicate } from "../actions";

type MergeCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  has_login: boolean;
};

export function MergeDuplicate({
  keepId,
  keepName,
  keepEmail,
  keepUserId,
}: {
  keepId: string;
  keepName: string;
  keepEmail: string | null;
  keepUserId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<MergeCandidate | null>(null);
  const [survivor, setSurvivor] = useState<"keep" | "lose">("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function runSearch() {
    setBusy(true);
    setError(null);
    const res = await searchMergeCandidates(keepId, query.trim());
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCandidates(res.candidates);
    setSearched(true);
  }

  async function confirmMerge() {
    if (!picked) return;
    const loserHasLogin = !!picked.user_id;
    const survivorUserId =
      survivor === "lose" && loserHasLogin ? picked.user_id : keepUserId;
    if (
      !confirm(
        `Merge "${picked.full_name}" INTO "${keepName}"?\n\nAll of their records move to ${keepName}, the duplicate is archived (never deleted), and the surviving login will be ${
          survivor === "lose" && loserHasLogin
            ? picked.email || "the duplicate's login"
            : keepEmail || "this profile's login"
        }. This can be reversed from a snapshot.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await mergeDuplicate(keepId, picked.id, survivorUserId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(`Merged ${picked.full_name} into ${keepName}.`);
    setPicked(null);
    setCandidates([]);
    setSearched(false);
    setQuery("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-body-xs text-muted hover:text-brick transition-colors"
      >
        Merge a duplicate into this profile
      </button>
    );
  }

  return (
    <div className="bg-paper border border-bone rounded-card p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-body-sm font-medium text-ink">Merge a duplicate</p>
        <button
          onClick={() => setOpen(false)}
          className="text-body-xs text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      <p className="text-body-xs text-ash mb-3">
        Find the other record for this same person. Their history moves here; the
        duplicate is archived, not deleted.
      </p>

      {done && (
        <p className="text-body-sm text-confirmed bg-confirmed/10 rounded-card px-3 py-2 mb-3">
          {done}
        </p>
      )}
      {error && (
        <p className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          placeholder="Search by name or email"
          className="flex-1 px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none"
        />
        <button
          onClick={runSearch}
          disabled={busy || !query.trim()}
          className="px-3 py-1.5 bg-ink text-paper text-body-xs rounded-card disabled:opacity-50"
        >
          {busy ? "…" : "Search"}
        </button>
      </div>

      {searched && candidates.length === 0 && (
        <p className="text-body-xs text-muted">No other records match.</p>
      )}

      <div className="space-y-2">
        {candidates.map((c) => {
          const isPicked = picked?.id === c.id;
          return (
            <div
              key={c.id}
              className={`border rounded-card p-3 ${
                isPicked ? "border-brick/40 bg-brick/5" : "border-bone"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-body-sm text-ink">{c.full_name}</p>
                  <p className="text-body-xs text-muted">
                    {c.email || "no email"}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.has_login ? " · has login" : " · no login"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPicked(isPicked ? null : c);
                    setSurvivor("keep");
                  }}
                  className="text-body-xs text-brick hover:underline shrink-0 ml-3"
                >
                  {isPicked ? "Cancel" : "Select"}
                </button>
              </div>

              {isPicked && (
                <div className="mt-3 pt-3 border-t border-bone">
                  <p className="text-body-xs text-ash mb-2">
                    Which login should this person keep?
                  </p>
                  <div className="space-y-1.5 mb-3">
                    <label className="flex items-center gap-2 text-body-xs text-ink">
                      <input
                        type="radio"
                        checked={survivor === "keep"}
                        onChange={() => setSurvivor("keep")}
                      />
                      This profile&rsquo;s login ({keepEmail || "current"})
                    </label>
                    <label
                      className={`flex items-center gap-2 text-body-xs ${
                        c.has_login ? "text-ink" : "text-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        disabled={!c.has_login}
                        checked={survivor === "lose"}
                        onChange={() => setSurvivor("lose")}
                      />
                      The duplicate&rsquo;s login ({c.email || "—"})
                    </label>
                  </div>
                  <button
                    onClick={confirmMerge}
                    disabled={busy}
                    className="px-4 py-1.5 bg-brick text-paper text-body-xs font-medium rounded-card hover:bg-brick/90 disabled:opacity-50"
                  >
                    {busy ? "Merging…" : `Merge into ${keepName}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
