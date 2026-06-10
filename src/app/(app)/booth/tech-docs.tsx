"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDesignReference, deleteDesignReference } from "./set-design-actions";

interface DocItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string;
  created_at: string;
  file_name?: string | null;
  mime_type?: string | null;
}

interface Props {
  productionId: string;
  docs: DocItem[];
  canManage: boolean;
}

// Production-wide technical documents that span departments: the tech
// rider, stage plots, schedules, venue paperwork. Lives in the Booth
// header above the department tabs so every department sees the same set.
export function TechDocs({ productionId, docs, canManage }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(docs.length > 0);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a file."); return; }
    if (!title.trim()) { setError("Give the document a title."); return; }
    setSaving(true); setError(null);
    const fd = new FormData();
    fd.set("image", file);
    const result = await saveDesignReference({
      production_id: productionId,
      department: "general",
      title: title.trim(),
      description: null,
      category: "technical",
      formData: fd,
    });
    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    setTitle("");
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(false);
    setOpen(true);
    router.refresh();
  }

  return (
    <div className="bg-card border border-bone rounded-card px-4 py-3 mb-6">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left min-w-0">
          <span className="text-body-sm font-medium text-ink">Tech Docs</span>
          <span className="text-body-xs text-muted">
            {docs.length === 0 ? "Rider, plots, and paperwork that span departments" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </span>
          <span className="text-[10px] text-ash">{open ? "▴" : "▾"}</span>
        </button>
        {canManage && (
          <button
            onClick={() => { setShowForm((s) => !s); setOpen(true); }}
            className="shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors"
          >
            + Add doc
          </button>
        )}
      </div>

      {open && showForm && canManage && (
        <div className="mt-3 border border-bone rounded-card bg-paper p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title, e.g. Technical Rider June 2026"
              className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-card text-ink focus:outline-none focus:border-brick"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.dwg,.vwx,.pptx,.zip"
              className="text-body-sm text-ash file:mr-3 file:px-3 file:py-1.5 file:bg-bone/50 file:border-0 file:rounded-card file:text-body-xs file:text-ink file:cursor-pointer"
            />
          </div>
          {error && <p className="text-body-xs text-brick">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={saving}
              className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Uploading…" : "Upload"}
            </button>
            <button onClick={() => setShowForm(false)} disabled={saving} className="px-3 py-1.5 text-body-xs text-ash hover:text-ink">Cancel</button>
          </div>
          <p className="text-body-xs text-muted">Documents and images. 10MB max per file.</p>
        </div>
      )}

      {open && (
        docs.length === 0 ? (
          !showForm && (
            <p className="mt-3 text-body-xs text-muted">
              Nothing here yet.{canManage ? " Add the tech rider, stage plot, or any document the whole team needs." : ""}
            </p>
          )
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {docs.map((d) => {
              const isImage = d.mime_type
                ? d.mime_type.startsWith("image/")
                : !/\.(pdf|xlsx|xls|csv|docx|doc|txt|dwg|vwx|pptx|zip)(\?|$)/i.test(d.image_url);
              return (
                <div key={d.id} className="flex items-center gap-2 bg-paper border border-bone rounded-card pl-3 pr-2 py-1.5 max-w-full">
                  <a
                    href={d.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 min-w-0 group"
                    title={d.file_name || d.title}
                  >
                    <span aria-hidden className="shrink-0">{isImage ? "🖼️" : "📄"}</span>
                    <span className="text-body-xs text-ink truncate group-hover:text-brick transition-colors">{d.title}</span>
                  </a>
                  {canManage && (
                    <button
                      onClick={async () => {
                        if (confirm(`Delete "${d.title}"?`)) {
                          await deleteDesignReference(d.id);
                          router.refresh();
                        }
                      }}
                      className="shrink-0 text-muted hover:text-brick text-body-xs"
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
