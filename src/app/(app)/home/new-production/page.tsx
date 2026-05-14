"use client";

import { useState } from "react";
import { createProduction } from "@/app/(app)/productions/actions";
import Link from "next/link";

export default function NewProductionPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createProduction(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, createProduction redirects to /productions/[id]
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <Link
          href="/home"
          className="text-body-sm text-ash hover:text-brick transition-colors"
        >
          &larr; Home
        </Link>
        <h1 className="font-display text-display-md text-ink mt-3">
          New production
        </h1>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {error && (
          <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
            {error}
          </div>
        )}

        {/* Title + Playwright */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="title" className="block text-body-sm text-ash mb-1.5">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              placeholder="The Jubilee Show"
            />
          </div>
          <div>
            <label htmlFor="playwright" className="block text-body-sm text-ash mb-1.5">
              Playwright
            </label>
            <input
              id="playwright"
              name="playwright"
              type="text"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="venue" className="block text-body-sm text-ash mb-1.5">
              Venue
            </label>
            <input
              id="venue"
              name="venue"
              type="text"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              placeholder="Heritage Parc"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="first_rehearsal" className="block text-body-sm text-ash mb-1.5">
              First rehearsal
            </label>
            <input
              id="first_rehearsal"
              name="first_rehearsal"
              type="date"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="opening_date" className="block text-body-sm text-ash mb-1.5">
              Opening
            </label>
            <input
              id="opening_date"
              name="opening_date"
              type="date"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="closing_date" className="block text-body-sm text-ash mb-1.5">
              Closing
            </label>
            <input
              id="closing_date"
              name="closing_date"
              type="date"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="has_music"
              className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
            />
            <span className="text-body-sm text-ink">Music</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="has_choreography"
              className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
            />
            <span className="text-body-sm text-ink">Choreography</span>
          </label>
        </div>

        {/* Your role */}
        <div>
          <label htmlFor="creator_role" className="block text-body-sm text-ash mb-1.5">
            Your role on this production
          </label>
          <input
            id="creator_role"
            name="creator_role"
            type="text"
            defaultValue="Director"
            className="w-full max-w-xs px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink focus:border-brick focus:outline-none transition-colors"
          />
          <p className="text-body-xs text-muted mt-1">
            You&rsquo;ll be assigned as director with full access.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/home"
            className="px-4 py-2.5 text-body-md text-ash hover:text-ink transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create production"}
          </button>
        </div>
      </form>
    </div>
  );
}
