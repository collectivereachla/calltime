"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  personId: string;
  currentUrl: string | null;
  size?: "sm" | "md" | "lg";
}

function compressImage(file: Blob, maxDim = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim && file.size < 2 * 1024 * 1024) {
        resolve(file);
        return;
      }
      if (width > height) {
        if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        0.88
      );
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
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

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }

    setError(null);
    setUploading(true);

    let uploadBlob: Blob;
    try {
      uploadBlob = await compressImage(file);
    } catch {
      setError("Couldn't process that image. Try a different file.");
      setUploading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(uploadBlob);

    const supabase = createClient();
    const filePath = `${personId}/headshot.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("headshots")
      .upload(filePath, uploadBlob, { upsert: true, contentType: "image/jpeg" });

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
        accept="image/jpeg,image/png,image/webp"
        onChange={handleUpload}
        className="hidden"
      />
      {error && <p className="text-body-xs text-brick">{error}</p>}
    </div>
  );
}
