"use client";

import { useState } from "react";
import { updateOrganization } from "./actions";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
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
            <label className="block text-body-xs text-ash mb-1">Logo URL</label>
            <input
              name="logo_url"
              type="url"
              defaultValue={org.logo_url || ""}
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
              placeholder="https://example.com/logo.png"
            />
            {org.logo_url && (
              <img src={org.logo_url} alt="" className="mt-2 w-12 h-12 rounded-card object-cover" />
            )}
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
