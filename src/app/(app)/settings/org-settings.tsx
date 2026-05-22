"use client";

import { useState, useRef } from "react";
import { updateOrganization } from "./actions";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface OrgData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  logo_url: string | null;
}

export function OrgSettings({ org }: { org: OrgData }) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(org.logo_url);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    // Upload logo if a new file was selected
    let logoUrl = org.logo_url;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop() || "jpg";
      const filePath = `${org.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("org-assets")
        .upload(filePath, logoFile, { upsert: true, contentType: logoFile.type });

      if (uploadError) {
        setSaving(false);
        setStatus(`Upload error: ${uploadError.message}`);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("org-assets")
        .getPublicUrl(filePath);
      logoUrl = urlData.publicUrl + "?t=" + Date.now();
    }

    const fd = new FormData(e.currentTarget);
    fd.set("logo_url", logoUrl || "");
    const result = await updateOrganization(org.id, fd);
    setSaving(false);
    if (result.error) {
      setStatus(`Error: ${result.error}`);
    } else {
      setStatus("Saved.");
      router.refresh();
      setTimeout(() => setStatus(null), 2000);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-body-md font-medium text-ink mb-4">Organization</h2>
      <div className="bg-card border border-bone rounded-card p-6">
        <p className="text-body-xs text-ash mb-4">
          This controls your public page at checkcalltime.art/org/{org.slug}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-body-xs text-ash mb-1">Name</label>
            <input
              name="name"
              defaultValue={org.name}
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-body-xs text-ash mb-1">Description</label>
            <textarea
              name="description"
              defaultValue={org.description || ""}
              rows={3}
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors resize-y"
              placeholder="A short description of your company..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">City</label>
              <input
                name="city"
                defaultValue={org.city || ""}
                className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">State</label>
              <input
                name="state"
                defaultValue={org.state || ""}
                className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
                placeholder="LA"
              />
            </div>
          </div>

          <div>
            <label className="block text-body-xs text-ash mb-1">Website</label>
            <input
              name="website"
              type="url"
              defaultValue={org.website || ""}
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
              placeholder="https://yourcompany.org"
            />
          </div>

          <div>
            <label className="block text-body-xs text-ash mb-1">Logo</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img src={logoPreview} alt="" className="w-16 h-16 rounded-card object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-card bg-bone/50 flex items-center justify-center">
                  <span className="font-display text-display-md text-ash">{org.name.charAt(0)}</span>
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 text-body-xs font-medium border border-bone rounded-card hover:border-ink transition-colors"
                >
                  {logoPreview ? "Change logo" : "Upload logo"}
                </button>
                {logoFile && (
                  <p className="text-body-xs text-ash mt-1">{logoFile.name}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {status && (
              <span className={`text-body-xs ${status.startsWith("Error") ? "text-brick" : "text-confirmed"}`}>
                {status}
              </span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
