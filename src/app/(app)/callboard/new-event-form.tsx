"use client";

import { useState } from "react";
import { createScheduleEvent } from "./actions";
import { useRouter } from "next/navigation";

const eventTypes = [
  { value: "rehearsal", label: "Rehearsal" },
  { value: "tech", label: "Tech" },
  { value: "performance", label: "Performance" },
  { value: "meeting", label: "Meeting" },
  { value: "fitting", label: "Fitting" },
  { value: "photo_call", label: "Photo Call" },
  { value: "load_in", label: "Load-in" },
  { value: "strike", label: "Strike" },
  { value: "other", label: "Other" },
];

interface Props {
  productions: { id: string; title: string }[];
}

export function NewEventForm({ productions }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createScheduleEvent(formData);
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
        + New event
      </button>
    );
  }

  return (
    <div className="bg-card border border-bone rounded-card p-5">
      <h3 className="text-body-md font-medium text-ink mb-4">New event</h3>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
            {error}
          </div>
        )}

        {/* Production + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-body-xs text-ash mb-1">Production</label>
            <select
              name="production_id"
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            >
              {productions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Type</label>
            <select
              name="event_type"
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            >
              {eventTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-body-xs text-ash mb-1">Title</label>
          <input
            name="title"
            type="text"
            required
            placeholder="Stumble-through Acts 1–2"
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
          />
        </div>

        {/* Date + Times */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-body-xs text-ash mb-1">Date</label>
            <input
              name="event_date"
              type="date"
              required
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Start</label>
            <input
              name="start_time"
              type="time"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">End</label>
            <input
              name="end_time"
              type="time"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Location + Notes */}
        <div>
          <label className="block text-body-xs text-ash mb-1">Location</label>
          <input
            name="location"
            type="text"
            placeholder="Heritage Parc"
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-body-xs text-ash mb-1">Notes</label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Bring scripts. Off-book for Act 1."
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Call everyone toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="call_everyone"
            defaultChecked
            className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
          />
          <span className="text-body-sm text-ink">Call entire company</span>
        </label>

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
            {loading ? "Posting..." : "Post to callboard"}
          </button>
        </div>
      </form>
    </div>
  );
}
