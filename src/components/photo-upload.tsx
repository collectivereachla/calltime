"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  personId: string;
  currentUrl: string | null;
  size?: "sm" | "md" | "lg";
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
      setError("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }

    setError(null);
    setUploading(true);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    const supabase = createClient();

    // Get current user for the storage path
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated.");
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${user.id}/headshot.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("headshots")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("headshots")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    // Update person record via RPC
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
