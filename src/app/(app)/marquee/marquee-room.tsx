"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordPromoAsset, deletePromoAsset, getPromoDownloadUrl } from "./marquee-actions";

interface Asset {
  id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  caption: string | null; created_at: string; uploaded_by: string | null; file_path: string;
  uploaderName: string; isImage: boolean; previewUrl: string | null;
}

interface Props {
  productionId: string;
  orgId: string;
  myPersonId: string;
  canManage: boolean;
  assets: Asset[];
}

const MAX_BYTES = 100 * 1024 * 1024;

function formatBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function ext(name: string) {
  const m = name.split(".").pop();
  return m && m.length <= 5 ? m.toUpperCase() : "FILE";
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(-120);
}

export function MarqueeRoom({ productionId, orgId, myPersonId, canManage, assets }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      const path = `${orgId}/${productionId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("promo-assets")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) {
        setError(`${file.name}: ${upErr.message}`);
        continue;
      }
      const res = await recordPromoAsset({
        productionId,
        filePath: path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        caption: "",
      });
      if (res?.error) setError(`${file.name}: ${res.error}`);
    }
    setUploading(false);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function handleDownload(asset: Asset) {
    const res = await getPromoDownloadUrl(asset.file_path, asset.file_name);
    if (res.error || !res.url) { setError(res.error || "Couldn't open the file."); return; }
    const a = document.createElement("a");
    a.href = res.url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleDelete(asset: Asset) {
    setDeleting(asset.id); setError(null);
    const res = await deletePromoAsset(asset.id);
    setDeleting(null);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <div>
      {/* Upload */}
      <div className="mb-6">
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
          disabled={uploading}
          className="hidden"
          id="promo-upload"
        />
        <label
          htmlFor="promo-upload"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-card text-body-sm font-medium cursor-pointer transition-colors ${
            uploading ? "bg-ash/30 text-paper cursor-wait" : "bg-ink text-paper hover:bg-ink/90"
          }`}
        >
          {uploading ? "Uploading…" : "+ Upload photos / flyers"}
        </label>
        <p className="text-body-xs text-muted mt-2">
          Originals are kept at full resolution. Images, PDFs, anything up to 100 MB. Everyone in the company can download them.
        </p>
        {progress && <p className="text-body-xs text-ash mt-1">{progress}</p>}
        {error && <p className="text-body-xs text-brick mt-1">{error}</p>}
      </div>

      {assets.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-12 text-center">
          <p className="text-body-md text-ash">No promo materials yet.</p>
          <p className="text-body-sm text-muted mt-1">Upload the first photo or flyer to start the collection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((a) => {
            const canDelete = canManage || a.uploaded_by === myPersonId;
            return (
              <div key={a.id} className="bg-card border border-bone rounded-card overflow-hidden flex flex-col">
                <div className="aspect-square bg-bone/40 flex items-center justify-center overflow-hidden">
                  {a.isImage && a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewUrl} alt={a.caption || a.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-body-lg font-mono text-ash">{ext(a.file_name)}</span>
                  )}
                </div>
                <div className="p-2.5 flex flex-col gap-1 flex-1">
                  <p className="text-body-xs text-ink truncate" title={a.file_name}>{a.caption || a.file_name}</p>
                  <p className="text-[10px] text-muted">
                    {a.uploaderName}{a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleDownload(a)}
                      className="text-[11px] font-medium text-brick hover:underline"
                    >
                      Download
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(a)}
                        disabled={deleting === a.id}
                        className="text-[11px] text-ash hover:text-brick disabled:opacity-50"
                      >
                        {deleting === a.id ? "…" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
