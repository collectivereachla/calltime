"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPressCoverage,
  updatePressCoverage,
  deletePressCoverage,
} from "./marquee-actions";

export interface CoverageItem {
  id: string;
  kind: string;
  title: string;
  outlet: string | null;
  published_date: string | null;
  url: string | null;
  pull_quote: string | null;
}

const KINDS: { v: string; label: string }[] = [
  { v: "review", label: "Review" },
  { v: "article", label: "Article" },
  { v: "press_release", label: "Press release" },
  { v: "mention", label: "Mention" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.v === k)?.label || "Article";

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const input =
  "w-full px-3 py-2 bg-card border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

type Draft = {
  kind: string;
  title: string;
  outlet: string;
  published_date: string;
  url: string;
  pull_quote: string;
};
const emptyDraft: Draft = {
  kind: "review",
  title: "",
  outlet: "",
  published_date: "",
  url: "",
  pull_quote: "",
};

export function PressCoverage({
  productionId,
  orgId,
  coverage,
  canManage,
}: {
  productionId: string;
  orgId: string;
  coverage: CoverageItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setDraft(emptyDraft);
    setEditingId(null);
    setAdding(true);
  }
  function startEdit(c: CoverageItem) {
    setDraft({
      kind: c.kind,
      title: c.title,
      outlet: c.outlet || "",
      published_date: c.published_date || "",
      url: c.url || "",
      pull_quote: c.pull_quote || "",
    });
    setAdding(false);
    setEditingId(c.id);
  }

  async function save() {
    if (!draft.title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      kind: draft.kind,
      title: draft.title,
      outlet: draft.outlet || null,
      publishedDate: draft.published_date || null,
      url: draft.url || null,
      pullQuote: draft.pull_quote || null,
    };
    const res = editingId
      ? await updatePressCoverage({ id: editingId, ...payload })
      : await addPressCoverage({ productionId, orgId, ...payload });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this press item?")) return;
    setBusy(true);
    const res = await deletePressCoverage(id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const Form = (
    <div className="bg-paper border border-bone rounded-card p-4 mb-4 space-y-3">
      {error && (
        <p className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <select
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          className={input}
        >
          {KINDS.map((k) => (
            <option key={k.v} value={k.v}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={draft.published_date}
          onChange={(e) => setDraft({ ...draft, published_date: e.target.value })}
          className={input}
        />
      </div>
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Headline / title"
        className={input}
      />
      <input
        value={draft.outlet}
        onChange={(e) => setDraft({ ...draft, outlet: e.target.value })}
        placeholder="Outlet (e.g. The Advocate)"
        className={input}
      />
      <input
        value={draft.url}
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        placeholder="Link (https://…)"
        className={input}
      />
      <textarea
        value={draft.pull_quote}
        onChange={(e) => setDraft({ ...draft, pull_quote: e.target.value })}
        placeholder="Pull-quote (optional)"
        rows={2}
        className={input}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : editingId ? "Save changes" : "Add"}
        </button>
        <button
          onClick={() => {
            setAdding(false);
            setEditingId(null);
            setError(null);
          }}
          className="px-3 py-1.5 text-body-xs text-ash hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-body-sm text-ash">
          Reviews, articles, press releases, and mentions for this production.
        </p>
        {canManage && !adding && editingId === null && (
          <button
            onClick={startAdd}
            className="px-3 py-1.5 bg-brick text-paper text-body-xs font-medium rounded-card hover:bg-brick/90"
          >
            + Add press
          </button>
        )}
      </div>

      {adding && Form}

      {coverage.length === 0 && !adding ? (
        <p className="text-body-sm text-muted py-8 text-center">
          No press logged yet.
        </p>
      ) : (
        <div className="space-y-3">
          {coverage.map((c) =>
            editingId === c.id ? (
              <div key={c.id}>{Form}</div>
            ) : (
              <div
                key={c.id}
                className="bg-card border border-bone rounded-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-brick bg-brick/10 px-1.5 py-0.5 rounded">
                        {kindLabel(c.kind)}
                      </span>
                      {(c.outlet || c.published_date) && (
                        <span className="text-body-xs text-ash">
                          {[c.outlet, fmtDate(c.published_date)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                    <p className="text-body-md text-ink font-medium">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-brick underline underline-offset-2"
                        >
                          {c.title}
                        </a>
                      ) : (
                        c.title
                      )}
                    </p>
                    {c.pull_quote && (
                      <p className="text-body-sm text-ash italic mt-1.5 border-l-2 border-bone pl-3">
                        &ldquo;{c.pull_quote}&rdquo;
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(c)}
                        className="text-body-xs text-ash hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        disabled={busy}
                        className="text-body-xs text-muted hover:text-brick disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
