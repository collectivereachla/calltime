"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  personId: string;
  currentUrl: string | null;
  size?: "sm" | "md" | "lg";
}

async function pdfToJpeg(file: File): Promise<Blob> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas conversion failed"))),
      "image/jpeg",
      0.92
    );
  });
}

export function PhotoUpload({ personId, currentUrl, size = "md" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const sizeClasses = {
    sm: "w-9 h-9",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isPdf) {
      setError("Upload an image (JPEG, PNG, WebP) or a PDF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }

    setError(null);
    setUploading(true);

    let uploadBlob: Blob = file;
    let ext = "jpg";

    try {
      if (isPdf) {
        uploadBlob = await pdfToJpeg(file);
        ext = "jpg";
      } else {
        ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      }
    } catch {
      setError("Couldn't read that PDF. Try a JPEG or PNG instead.");
      setUploading(false);
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(uploadBlob);

    const supabase = createClient();
    const filePath = `${personId}/headshot.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("headshots")
      .upload(filePath, uploadBlob, {
        upsert: true,
        contentType: isPdf ? "image/jpeg" : file.type,
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("headshots")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    const { error: rpcError } = await supabase.rpc("update_headshot", {
      p_person_id: personId,
      p_headshot_url: publicUrl,
    });

    if (rpcError) {
      setError(rpcError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={`${sizeClasses[size]} rounded-full overflow-hidden border-2 border-dashed border-bone hover:border-brick transition-colors cursor-pointer shrink-0 relative group`}
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-brick/10 flex items-center justify-center">
            <span className="text-brick text-body-xs">+</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-paper/70 flex items-center justify-center">
            <span className="text-[10px] text-ash">...</span>
          </div>
        )}
        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="text-[10px] text-paper font-medium">Edit</span>
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleUpload}
        className="hidden"
      />
      {error && <p className="text-body-xs text-brick">{error}</p>}
    </div>
  );
}
