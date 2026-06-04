"use client";

import { useMemo, useState, useTransition } from "react";
import { enterPreview, exitPreview } from "@/app/(app)/preview-actions";

type PersonOpt = { id: string; name: string };

export function PreviewBar({
  isPreview,
  previewName,
  canPreview,
  previewCookiePresent,
  people,
}: {
  isPreview: boolean;
  previewName: string | null;
  canPreview: boolean;
  previewCookiePresent: boolean;
  people: PersonOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? people.filter((p) => p.name.toLowerCase().includes(needle))
      : people;
    return list.slice(0, 60);
  }, [people, q]);

  // Active preview (or a lingering cookie) → read-only banner with Exit.
  if (isPreview || previewCookiePresent) {
    return (
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-brick px-4 py-2 text-paper">
        <span className="text-body-sm font-medium truncate">
          {isPreview ? (
            <>
              👁 Previewing as <span className="font-semibold">{previewName}</span>
              <span className="opacity-80"> — read-only</span>
            </>
          ) : (
            <>Preview active — read-only</>
          )}
        </span>
        <button
          onClick={() => startTransition(() => exitPreview())}
          disabled={pending}
          className="shrink-0 rounded-card bg-paper/20 px-3 py-1 text-body-xs font-semibold hover:bg-paper/30 disabled:opacity-50"
        >
          {pending ? "Exiting…" : "Exit preview"}
        </button>
      </div>
    );
  }

  if (!canPreview) return null;

  // Owner, not previewing → launcher + picker.
  return (
    <div className="sticky top-0 z-40">
      <div className="flex justify-end bg-paper/80 px-4 py-1 backdrop-blur">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-card border border-ash/30 px-2.5 py-1 text-body-xs font-medium text-ash hover:border-brick hover:text-brick"
        >
          👁 Preview as…
        </button>
      </div>

      {open && (
        <div className="absolute right-4 top-9 z-50 w-72 rounded-card border border-ash/20 bg-paper shadow-lg">
          <div className="border-b border-ash/15 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-card border border-ash/25 bg-paper px-2.5 py-1.5 text-body-sm text-ink outline-none focus:border-brick"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-body-xs text-ash">No matches.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    startTransition(() => enterPreview(p.id))
                  }
                  disabled={pending}
                  className="block w-full truncate px-3 py-1.5 text-left text-body-sm text-ink hover:bg-brick/10 disabled:opacity-50"
                >
                  {p.name}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-ash/15 px-3 py-1.5 text-body-xs text-ash">
            See the app exactly as they do. Read-only.
          </div>
        </div>
      )}
    </div>
  );
}
