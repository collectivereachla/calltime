"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordPromoAsset, deletePromoAsset, getPromoDownloadUrl, updatePromoAsset, setPromoOfficial, setPromoTags } from "./marquee-actions";

interface Person { id: string; name: string }
interface Asset {
  id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  caption: string | null; created_at: string; uploaded_by: string | null; file_path: string;
  uploaderName: string; isImage: boolean; previewUrl: string | null; isOfficial: boolean;
  isVideo: boolean; category: string; durationSeconds: number | null; tagged: Person[];
}

interface Props {
  productionId: string;
  orgId: string;
  myPersonId: string;
  canManage: boolean;
  canApprove: boolean;
  assets: Asset[];
  roster: Person[];
}

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 35;

const CATEGORIES = [
  { key: "flyer", label: "Flyers" },
  { key: "photo", label: "Promotional Photos" },
  { key: "headshot", label: "Headshots" },
  { key: "highlight", label: "Company Highlights" },
  { key: "other", label: "Other" },
];
const CAT_ORDER: Record<string, number> = { flyer: 0, photo: 1, headshot: 2, highlight: 3, other: 4 };
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// Top-level so it keeps a stable identity across re-renders (no focus loss).
function PeoplePicker({ roster, selected, onToggle }: { roster: Person[]; selected: string[]; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? roster.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : roster;
  return (
    <div className="border border-bone rounded-card bg-paper p-2 w-full">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…"
        className="w-full px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick mb-1.5" />
      <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
        {shown.length === 0 ? (
          <p className="text-body-xs text-muted px-1 py-1">No matches.</p>
        ) : shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => onToggle(p.id)}
              className={`text-left text-body-xs px-2 py-1 rounded flex items-center justify-between ${on ? "bg-brick/10 text-ink" : "text-ash hover:bg-bone/50"}`}>
              <span>{p.name}</span>
              {on && <span className="text-brick">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDuration(s: number | null) {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function ext(name: string) {
  const m = name.split(".").pop();
  return m && m.length <= 5 ? m.toUpperCase() : "FILE";
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(-120);
}
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that video file.")); };
    v.src = url;
  });
}

export function MarqueeRoom({ productionId, orgId, myPersonId, canManage, canApprove, assets, roster }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadCategory, setUploadCategory] = useState("photo");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("other");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  async function handleFiles(files: FileList) {
    setError(null);
    const list = Array.from(files);
    setUploading(true);
    let done = 0;
    for (const file of list) {
      done++;
      setProgress(`Uploading ${done} of ${list.length}: ${file.name}`);
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 100 MB and was skipped.`);
        continue;
      }
      let duration: number | null = null;
      if (file.type.startsWith("video/")) {
        try {
          duration = Math.round(await getVideoDuration(file));
        } catch {
          setError(`${file.name}: couldn't read the video, so it was skipped.`);
          continue;
        }
        if (duration > MAX_VIDEO_SECONDS + 1) {
          setError(`${file.name} is ${fmtDuration(duration)} — videos must be ${MAX_VIDEO_SECONDS} seconds or shorter.`);
          continue;
        }
      }
      const path = `${orgId}/${productionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("promo-assets")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) { setError(`${file.name}: ${upErr.message}`); continue; }
      const res = await recordPromoAsset({
        productionId, filePath: path, fileName: file.name,
        mimeType: file.type || null, sizeBytes: file.size, caption: "",
        category: uploadCategory, durationSeconds: duration,
        taggedPersonIds: uploadTags,
      });
      if (res?.error) setError(`${file.name}: ${res.error}`);
    }
    setUploading(false);
    setProgress(null);
    setUploadTags([]);
    setTagPanelOpen(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function handleDownload(a: Asset) {
    const res = await getPromoDownloadUrl(a.file_path, a.file_name);
    if (res.error || !res.url) { setError(res.error || "Couldn't open the file."); return; }
    const el = document.createElement("a");
    el.href = res.url; el.rel = "noopener";
    document.body.appendChild(el); el.click(); el.remove();
  }

  async function handleDelete(a: Asset) {
    setDeleting(a.id); setError(null);
    const res = await deletePromoAsset(a.id);
    setDeleting(null);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  async function handleSetOfficial(a: Asset, val: boolean) {
    setError(null);
    const res = await setPromoOfficial(a.id, val);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  function startEdit(a: Asset) {
    setEditing(a.id);
    setEditName(a.caption || a.file_name);
    setEditCategory(a.category || "other");
    setEditTags(a.tagged.map((t) => t.id));
  }
  async function saveEdit(a: Asset) {
    setSavingEdit(true); setError(null);
    const res = await updatePromoAsset(a.id, editName, editCategory);
    if (!res?.error) {
      const tagRes = await setPromoTags(a.id, editTags);
      if (tagRes?.error) { setSavingEdit(false); setError(tagRes.error); return; }
    }
    setSavingEdit(false);
    if (res?.error) { setError(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  const counts: Record<string, number> = {};
  for (const a of assets) counts[a.category] = (counts[a.category] || 0) + 1;
  const videoCount = assets.filter((a) => a.isVideo).length;

  const shown = (
    filter === "all"
      ? assets
      : filter === "video"
        ? assets.filter((a) => a.isVideo)
        : assets.filter((a) => a.category === filter)
  )
    .slice()
    .sort((a, b) => (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9));
  const official = shown.filter((a) => a.isOfficial);
  const member = shown.filter((a) => !a.isOfficial);

  const renderCard = (a: Asset) => {
    const canEdit = canManage || a.uploaded_by === myPersonId;
    const isEditing = editing === a.id;
    return (
      <div key={a.id} className="bg-card border border-bone rounded-card overflow-hidden flex flex-col">
        <div className="relative aspect-square bg-bone/40 flex items-center justify-center overflow-hidden">
          {a.isImage && a.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.previewUrl} alt={a.caption || a.file_name} className="w-full h-full object-cover" />
          ) : a.isVideo && a.previewUrl ? (
            <video src={a.previewUrl} controls playsInline preload="metadata" className="w-full h-full object-cover" />
          ) : (
            <span className="text-body-lg font-mono text-ash">{ext(a.file_name)}</span>
          )}
          {a.isVideo && a.durationSeconds != null && (
            <span className="absolute bottom-1 right-1 text-[10px] bg-ink/80 text-paper rounded px-1">{fmtDuration(a.durationSeconds)}</span>
          )}
        </div>
        <div className="p-2.5 flex flex-col gap-1 flex-1">
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name"
                className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              {roster.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted mb-1">Tag people (they&apos;ll be notified)</p>
                  <PeoplePicker roster={roster} selected={editTags} onToggle={(id) => setEditTags((t) => toggle(t, id))} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => saveEdit(a)} disabled={savingEdit}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
                  {savingEdit ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(null)} disabled={savingEdit} className="text-[11px] text-ash hover:text-ink">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {canEdit ? (
                <button onClick={() => startEdit(a)} title="Click to rename"
                  className="text-body-xs text-ink truncate text-left hover:text-brick w-full">
                  {a.caption || a.file_name} <span className="text-muted">✎</span>
                </button>
              ) : (
                <p className="text-body-xs text-ink truncate" title={a.file_name}>{a.caption || a.file_name}</p>
              )}
              <span className="self-start text-[10px] text-muted bg-bone/60 rounded px-1.5 py-0.5">{CAT_LABEL[a.category] || "Other"}</span>
              <p className="text-[10px] text-muted">{a.uploaderName}{a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}</p>
              {a.tagged.length > 0 && (
                <p className="text-[10px] text-ash truncate" title={a.tagged.map((t) => t.name).join(", ")}>
                  Tagged: {a.tagged.map((t) => t.name).join(", ")}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                <button onClick={() => handleDownload(a)} className="text-[11px] font-medium text-brick hover:underline">Download</button>
                {canEdit && <button onClick={() => startEdit(a)} className="text-[11px] text-ash hover:text-ink">Rename</button>}
                {canApprove && (
                  <button onClick={() => handleSetOfficial(a, !a.isOfficial)} className="text-[11px] text-ash hover:text-ink" title={a.isOfficial ? "Move to Company Uploads" : "Promote to Approved"}>
                    {a.isOfficial ? "Unapprove" : "Approve"}
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => handleDelete(a)} disabled={deleting === a.id} className="text-[11px] text-ash hover:text-brick disabled:opacity-50">
                    {deleting === a.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const grid = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

  return (
    <div>
      {/* Upload */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-body-xs text-muted block mb-1">Upload as</label>
          <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} disabled={uploading}
            className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <input ref={fileRef} type="file" multiple
          onChange={(e) => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
          disabled={uploading} className="hidden" id="promo-upload" />
        <label htmlFor="promo-upload"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-card text-body-sm font-medium cursor-pointer transition-colors ${
            uploading ? "bg-ash/30 text-paper cursor-wait" : "bg-ink text-paper hover:bg-ink/90"
          }`}>
          {uploading ? "Uploading…" : "+ Upload photos / flyers / video"}
        </label>
        {roster.length > 0 && (
          <button type="button" onClick={() => setTagPanelOpen((o) => !o)} disabled={uploading}
            className="px-3 py-2 text-body-sm rounded-card border border-bone text-ash hover:text-ink hover:border-brick">
            Tag people{uploadTags.length > 0 ? ` (${uploadTags.length})` : ""}
          </button>
        )}
      </div>
      {tagPanelOpen && roster.length > 0 && (
        <div className="mb-4 max-w-sm">
          <p className="text-body-xs text-muted mb-1">These people will be notified when you upload.</p>
          <PeoplePicker roster={roster} selected={uploadTags} onToggle={(id) => setUploadTags((t) => toggle(t, id))} />
        </div>
      )}
      <p className="text-body-xs text-muted mb-1">
        Originals stay full resolution. Photos, flyers, PDFs, and video clips up to {MAX_VIDEO_SECONDS} seconds (max 100 MB). Everyone can download.
      </p>
      {progress && <p className="text-body-xs text-ash mb-1">{progress}</p>}
      {error && <p className="text-body-xs text-brick mb-1">{error}</p>}

      {/* Category filter */}
      {assets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-5">
          <button onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-full text-body-xs ${filter === "all" ? "bg-ink text-paper" : "bg-bone/50 text-ash hover:text-ink"}`}>
            All ({assets.length})
          </button>
          {videoCount > 0 && (
            <button onClick={() => setFilter("video")}
              className={`px-2.5 py-1 rounded-full text-body-xs ${filter === "video" ? "bg-ink text-paper" : "bg-bone/50 text-ash hover:text-ink"}`}>
              Videos ({videoCount})
            </button>
          )}
          {CATEGORIES.filter((c) => counts[c.key]).map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-2.5 py-1 rounded-full text-body-xs ${filter === c.key ? "bg-ink text-paper" : "bg-bone/50 text-ash hover:text-ink"}`}>
              {c.label} ({counts[c.key]})
            </button>
          ))}
        </div>
      )}

      {assets.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-12 text-center">
          <p className="text-body-md text-ash">No promo materials yet.</p>
          <p className="text-body-sm text-muted mt-1">Pick a category and upload the first photo, flyer, or clip.</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-body-lg font-medium text-ink">Approved</h2>
              <span className="text-body-xs text-muted">production team · owners, directors, stage managers, designers</span>
            </div>
            {official.length === 0 ? (
              <p className="text-body-sm text-muted">Nothing here{filter !== "all" ? " in this category" : ""} yet.</p>
            ) : (
              <div className={grid}>{official.map(renderCard)}</div>
            )}
          </section>

          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-body-lg font-medium text-ink">Company Uploads</h2>
              <span className="text-body-xs text-muted">shared by other company members</span>
            </div>
            {member.length === 0 ? (
              <p className="text-body-sm text-muted">Nothing here{filter !== "all" ? " in this category" : ""} yet.</p>
            ) : (
              <div className={grid}>{member.map(renderCard)}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
