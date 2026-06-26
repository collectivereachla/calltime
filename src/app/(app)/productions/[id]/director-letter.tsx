"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { upsertDirectorLetter, markLetterRead } from "../actions";

type Letter = {
  id: string;
  title: string | null;
  body: string;
  published: boolean;
} | null;

export function DirectorLetter({
  productionId,
  canManage,
  letter,
  readCount,
  assignedCount,
}: {
  productionId: string;
  canManage: boolean;
  letter: Letter;
  readCount: number;
  assignedCount: number;
}) {
  const router = useRouter();
  const marked = useRef(false);

  // A reader who can see a published letter records that they've read it (once).
  useEffect(() => {
    if (!canManage && letter?.published && letter.id && !marked.current) {
      marked.current = true;
      markLetterRead(letter.id).catch(() => {});
    }
  }, [canManage, letter]);

  // ---- Member / reader view ----
  if (!canManage) {
    if (!letter?.published) return null;
    return (
      <section className="mb-8 bg-card border border-bone rounded-card p-6">
        <p className="text-body-xs text-muted uppercase tracking-wider mb-2">From the director</p>
        {letter.title && <h2 className="font-display text-display-sm text-ink mb-3">{letter.title}</h2>}
        <div className="text-body-md text-ink whitespace-pre-wrap leading-relaxed">{letter.body}</div>
      </section>
    );
  }

  // ---- Leadership editor ----
  return <DirectorLetterEditor productionId={productionId} letter={letter} readCount={readCount} assignedCount={assignedCount} onSaved={() => router.refresh()} />;
}

function DirectorLetterEditor({
  productionId, letter, readCount, assignedCount, onSaved,
}: {
  productionId: string;
  letter: Letter;
  readCount: number;
  assignedCount: number;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(letter?.title || "");
  const [body, setBody] = useState(letter?.body || "");
  const [published, setPublished] = useState(letter?.published ?? false);
  const [editing, setEditing] = useState(!letter);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus(null);
    const r = await upsertDirectorLetter(productionId, title, body, published);
    setSaving(false);
    if (r?.error) { setStatus(r.error); return; }
    setStatus("Saved");
    setEditing(false);
    onSaved();
  }

  return (
    <section className="mb-8 bg-card border border-bone rounded-card p-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-body-xs text-muted uppercase tracking-wider">Director&rsquo;s letter</p>
        {letter?.published && (
          <span className="text-body-xs text-ash shrink-0">
            Read by {readCount} of {assignedCount}
          </span>
        )}
      </div>
      <p className="text-body-xs text-ash mb-4">
        A note to the company, in your voice. Everyone assigned sees it once you publish.
      </p>

      {!editing && letter ? (
        <>
          {letter.title && <h2 className="font-display text-display-sm text-ink mb-2">{letter.title}</h2>}
          {letter.body
            ? <div className="text-body-md text-ink whitespace-pre-wrap leading-relaxed">{letter.body}</div>
            : <p className="text-body-sm text-muted italic">No letter written yet.</p>}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <span className={`text-body-xs px-2 py-0.5 rounded-full ${letter.published ? "bg-confirmed/10 text-confirmed" : "bg-bone/40 text-muted"}`}>
              {letter.published ? "Published" : "Draft"}
            </span>
            <button onClick={() => setEditing(true)} className="text-body-xs font-medium text-brick hover:underline">Edit</button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional) — e.g. To the company"
            className="w-full px-3 py-2 text-body-md bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Write your letter to the company…"
            className="w-full px-3 py-2 text-body-md bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none resize-y leading-relaxed"
          />
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Published (visible to everyone assigned)
          </label>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            {letter && <button onClick={() => setEditing(false)} disabled={saving} className="text-body-sm text-ash hover:text-ink">Cancel</button>}
            {status && <span className="text-body-xs text-ash">{status}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
