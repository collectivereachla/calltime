"use client";

import { useState } from "react";
import { addPersonToProduction } from "@/app/(app)/productions/actions";
import { useRouter } from "next/navigation";

const departments = [
  { value: "directing", label: "Directing" },
  { value: "stage_management", label: "Stage Management" },
  { value: "cast", label: "Cast" },
  { value: "design", label: "Design" },
  { value: "crew", label: "Crew" },
  { value: "music", label: "Music" },
  { value: "production", label: "Production" },
  { value: "marketing", label: "Marketing" },
];

const accessTiers = [
  { value: "director", label: "Director", description: "Full access to all rooms" },
  { value: "production_team", label: "Production Team", description: "SM, PM — access to Callboard, Run, Booth" },
  { value: "designer", label: "Designer", description: "Access to Booth (own department)" },
  { value: "crew", label: "Crew", description: "Access to Booth (own department)" },
  { value: "cast", label: "Cast", description: "Callboard, Run (own track)" },
  { value: "musician", label: "Musician", description: "Callboard, Run (own part)" },
  { value: "marketing", label: "Marketing", description: "Press room" },
  { value: "guest", label: "Guest", description: "View-only access" },
];

const castingOptions = [
  { value: "", label: "N/A" },
  { value: "single_cast", label: "Single cast" },
  { value: "rotating_cast", label: "Rotating cast" },
  { value: "track_sharing", label: "Track sharing" },
  { value: "understudy", label: "Understudy" },
  { value: "swing", label: "Swing" },
];

export function AddPersonForm({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    formData.set("production_id", productionId);
    const result = await addPersonToProduction(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors"
      >
        + Add person to production
      </button>
    );
  }

  return (
    <div className="bg-card border border-bone rounded-card p-6">
      <h3 className="text-body-md font-medium text-ink mb-4">
        Add person
      </h3>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
            {error}
          </div>
        )}

        {/* Name + Contact */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="full_name" className="block text-body-xs text-ash mb-1">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-body-xs text-ash mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-body-xs text-ash mb-1">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Role + Department + Access */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="role_title" className="block text-body-xs text-ash mb-1">
              Role / Title
            </label>
            <input
              id="role_title"
              name="role_title"
              type="text"
              required
              placeholder="Troy Maxson, Lighting Designer, SM..."
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="department" className="block text-body-xs text-ash mb-1">
              Department
            </label>
            <select
              id="department"
              name="department"
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            >
              {departments.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="access_tier" className="block text-body-xs text-ash mb-1">
              Access level
            </label>
            <select
              id="access_tier"
              name="access_tier"
              required
              defaultValue="cast"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            >
              {accessTiers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Casting structure */}
        <div className="max-w-xs">
          <label htmlFor="casting_structure" className="block text-body-xs text-ash mb-1">
            Casting structure
          </label>
          <select
            id="casting_structure"
            name="casting_structure"
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
          >
            {castingOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add to production"}
          </button>
        </div>
      </form>
    </div>
  );
}
