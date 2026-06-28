"use client";

import { useState } from "react";
import { createProduction } from "@/app/(app)/productions/actions";
import Link from "next/link";

export default function NewProductionPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [visibility, setVisibility] = useState("public");
  const [applicationTypes, setApplicationTypes] = useState<string[]>(["audition", "crew", "design"]);

  function toggleAppType(val: string) {
    setApplicationTypes((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  }

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
              placeholder="e.g. Our Spring Musical"
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

        {/* Open call */}
        <div className="pt-4 border-t border-bone space-y-4">
          <p className="text-body-xs text-muted uppercase tracking-wider">Open call</p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="accepting_applications"
              checked={acceptingApplications}
              onChange={() => setAcceptingApplications(!acceptingApplications)}
              className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
            />
            <span className="text-body-sm text-ink">Accepting applications</span>
          </label>

          {acceptingApplications && (
            <>
              <div>
                <label className="block text-body-sm text-ash mb-1.5">Accepting</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "audition", label: "Auditions" },
                    { value: "crew", label: "Crew" },
                    { value: "design", label: "Designers" },
                    { value: "music", label: "Musicians" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => toggleAppType(t.value)}
                      className={`px-3 py-1.5 rounded-card text-body-sm border transition-colors ${
                        applicationTypes.includes(t.value)
                          ? "bg-ink text-paper border-ink"
                          : "bg-card text-ash border-bone hover:border-ash"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="open_call_description" className="block text-body-sm text-ash mb-1.5">
                  Open call description
                </label>
                <textarea
                  id="open_call_description"
                  name="open_call_description"
                  placeholder="What you're looking for — roles, skills, anything applicants should know"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="max-w-xs">
                <label htmlFor="open_call_deadline" className="block text-body-sm text-ash mb-1.5">
                  Application deadline
                </label>
                <input
                  id="open_call_deadline"
                  name="open_call_deadline"
                  type="date"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink focus:border-brick focus:outline-none transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-body-sm text-ash mb-1.5">Visibility</label>
            <div className="flex gap-2 max-w-sm">
              {[
                { value: "public", label: "Public" },
                { value: "unlisted", label: "Unlisted" },
                { value: "private", label: "Private" },
              ].map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVisibility(v.value)}
                  className={`flex-1 px-3 py-2 rounded-card text-body-sm border transition-colors text-center ${
                    visibility === v.value
                      ? "bg-ink text-paper border-ink"
                      : "bg-card text-ash border-bone hover:border-ash"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hidden inputs for form data */}
          <input type="hidden" name="visibility" value={visibility} />
          <input type="hidden" name="application_types" value={JSON.stringify(applicationTypes)} />
        </div>

        {/* Your role */}
        <div className="pt-4 border-t border-bone">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-4">Your role on this production</p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label htmlFor="creator_role" className="block text-body-sm text-ash mb-1.5">
                Role title
              </label>
              <input
                id="creator_role"
                name="creator_role"
                type="text"
                defaultValue="Director"
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink focus:border-brick focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="creator_department" className="block text-body-sm text-ash mb-1.5">
                Department
              </label>
              <select
                id="creator_department"
                name="creator_department"
                defaultValue="directing"
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink focus:border-brick focus:outline-none transition-colors"
              >
                <option value="directing">Directing</option>
                <option value="cast">Cast</option>
                <option value="production">Production</option>
                <option value="stage_management">Stage Management</option>
                <option value="design">Design</option>
                <option value="music">Music</option>
                <option value="crew">Crew</option>
              </select>
            </div>
          </div>
          <p className="text-body-xs text-muted mt-1.5">
            You&rsquo;ll always have full admin access regardless of your role.
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
