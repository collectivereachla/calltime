"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateOpenCall } from "../actions";

const TYPES = [
  { v: "audition", label: "Audition (cast)" },
  { v: "crew", label: "Crew / Technician" },
  { v: "design", label: "Design" },
  { v: "music", label: "Music" },
  { v: "other", label: "Other" },
];

export function OpenCallCard({
  productionId,
  slug,
  accepting,
  types,
  description,
  deadline,
  pendingCount,
}: {
  productionId: string;
  slug: string;
  accepting: boolean;
  types: string[];
  description: string | null;
  deadline: string | null;
  pendingCount: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(accepting);
  const [sel, setSel] = useState<string[]>(types || []);
  const [desc, setDesc] = useState(description || "");
  const [dl, setDl] = useState(deadline ? deadline.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const applyPath = `/org/${slug}/apply/${productionId}`;
  const applyUrl =
    typeof window !== "undefined" ? `${window.location.origin}${applyPath}` : applyPath;
  const deadlinePassed = !!deadline && new Date(deadline) < new Date();

  function toggleType(v: string) {
    setSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const r = await updateOpenCall(productionId, {
      accepting: on,
      types: sel,
      description: desc.trim() || null,
      deadline: dl ? new Date(dl).toISOString() : null,
    });
    setSaving(false);
    if (r?.error) {
      setStatus(r.error);
      return;
    }
    setStatus("Saved");
    router.refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus("Couldn't copy — select and copy the link manually.");
    }
  }

  return (
    <div className="mt-8 bg-card border border-bone rounded-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-display-sm text-ink">Open Call</h2>
        {pendingCount > 0 && (
          <Link
            href="/applications"
            className="text-body-xs font-medium px-2 py-1 rounded-full bg-brick/10 text-brick shrink-0"
          >
            {pendingCount} to review &rarr;
          </Link>
        )}
      </div>
      <p className="text-body-xs text-ash mb-4">
        Let people apply or sign up to audition from a public link. You review and promote
        them into the company.
      </p>

      <button
        onClick={() => setOn((v) => !v)}
        disabled={saving}
        className={`px-3 py-1.5 text-body-xs font-medium rounded-card border transition-colors disabled:opacity-50 ${
          on
            ? "bg-confirmed/10 border-confirmed/30 text-confirmed"
            : "bg-bone/30 border-bone text-muted"
        }`}
      >
        {on ? "Accepting applications" : "Closed"}
      </button>

      {on && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">
              What people can apply for
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => {
                const active = sel.includes(t.v);
                return (
                  <button
                    key={t.v}
                    onClick={() => toggleType(t.v)}
                    className={`px-2.5 py-1 rounded-full text-body-xs border transition-colors ${
                      active
                        ? "bg-ink text-paper border-ink"
                        : "bg-paper text-ash border-bone hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">
              Description <span className="text-muted/70">(optional)</span>
            </p>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="What you're looking for, what to prepare, where auditions are held."
              className="w-full px-3 py-2 text-body-sm bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none resize-y"
            />
          </div>

          <div>
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">
              Deadline <span className="text-muted/70">(optional)</span>
            </p>
            <input
              type="datetime-local"
              value={dl}
              onChange={(e) => setDl(e.target.value)}
              className="px-3 py-2 text-body-sm bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none"
            />
            {deadlinePassed && (
              <p className="text-body-xs text-conflict mt-1">
                This deadline has passed &mdash; applications are closed even though the toggle is on.
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-bone/60">
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">
              Public application link
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-body-xs text-ink bg-paper border border-bone rounded px-2 py-1 break-all">
                {applyUrl}
              </code>
              <button
                onClick={copyLink}
                className="text-body-xs font-medium text-brick hover:underline shrink-0"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-body-xs text-ash">{status}</span>}
      </div>
    </div>
  );
}
