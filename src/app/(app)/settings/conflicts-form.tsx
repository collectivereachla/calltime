"use client";

import { useState } from "react";
import { submitConflict, deleteConflict } from "@/app/(app)/callboard/conflict-actions";
import { useRouter } from "next/navigation";

interface Conflict {
  id: string;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  conflict_type: string | null;
  description: string | null;
}

const CONFLICT_TYPES = [
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "medical", label: "Medical" },
  { value: "religious", label: "Religious" },
  { value: "family", label: "Family" },
  { value: "other_production", label: "Other production" },
  { value: "other", label: "Other" },
];

export function ConflictsForm({ conflicts }: { conflicts: Conflict[] }) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    fd.set("all_day", allDay ? "true" : "false");

    const result = await submitConflict(fd);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowForm(false);
      setAllDay(true);
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteConflict(id);
    setDeleting(null);
    router.refresh();
  }

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  function formatTime(t: string | null) {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const period = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${period}`;
  }

  const inputClass = "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";
  const upcoming = conflicts.filter(c => new Date(c.start_date + "T00:00:00") >= new Date(new Date().toDateString()));
  const past = conflicts.filter(c => new Date(c.start_date + "T00:00:00") < new Date(new Date().toDateString()));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-display-sm">My Availability</h3>
          <p className="text-body-sm text-ash mt-1">
            Submit dates you&apos;re unavailable. Your SM and director will see these when building the schedule.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors shrink-0"
          >
            Add conflict
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-bone rounded-card p-4 mb-4 space-y-3">
          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-sm text-ash mb-1">Start date</label>
              <input type="date" name="start_date" required className={inputClass} />
            </div>
            <div>
              <label className="block text-body-sm text-ash mb-1">End date <span className="text-muted">(optional)</span></label>
              <input type="date" name="end_date" className={inputClass} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="rounded border-bone text-brick focus:ring-brick"
              />
              All day
            </label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-body-sm text-ash mb-1">Start time</label>
                <input type="time" name="start_time" className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm text-ash mb-1">End time</label>
                <input type="time" name="end_time" className={inputClass} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-body-sm text-ash mb-1">Type</label>
            <select name="conflict_type" className={inputClass}>
              <option value="">Select...</option>
              {CONFLICT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-body-sm text-ash mb-1">Note <span className="text-muted">(optional)</span></label>
            <input type="text" name="description" placeholder="e.g. dentist appointment, church" className={inputClass} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
              {loading ? "Submitting..." : "Submit conflict"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null); }}
              className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Upcoming conflicts */}
      {upcoming.length > 0 ? (
        <div className="space-y-2">
          {upcoming.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-card border border-bone rounded-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-body-sm text-ink">
                  {formatDate(c.start_date)}
                  {c.end_date && c.end_date !== c.start_date ? ` — ${formatDate(c.end_date)}` : ""}
                  {!c.all_day && c.start_time ? `, ${formatTime(c.start_time)}${c.end_time ? `–${formatTime(c.end_time)}` : ""}` : ""}
                </p>
                <p className="text-body-xs text-ash mt-0.5">
                  {c.conflict_type && <span className="capitalize">{c.conflict_type.replace("_", " ")}</span>}
                  {c.conflict_type && c.description && " — "}
                  {c.description}
                  {!c.conflict_type && !c.description && "No details"}
                </p>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deleting === c.id}
                className="text-body-xs text-muted hover:text-brick transition-colors shrink-0 ml-3"
              >
                {deleting === c.id ? "..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <p className="text-body-sm text-muted py-3">No upcoming conflicts submitted. Your SM will appreciate it if you submit known conflicts early.</p>
      ) : null}

      {past.length > 0 && (
        <details className="mt-4">
          <summary className="text-body-xs text-muted cursor-pointer hover:text-ash transition-colors">
            {past.length} past conflict{past.length === 1 ? "" : "s"}
          </summary>
          <div className="space-y-1 mt-2 opacity-60">
            {past.map(c => (
              <div key={c.id} className="text-body-xs text-ash px-4 py-1.5">
                {formatDate(c.start_date)}{c.description ? ` — ${c.description}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
