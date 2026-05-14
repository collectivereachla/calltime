"use client";

import { useState } from "react";
import { updateScheduleEvent, deleteScheduleEvent } from "./actions";
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

interface EventData {
  id: string;
  event_type: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

export function EditEventButton({ event }: { event: EventData }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleUpdate(formData: FormData) {
    setError(null);
    setLoading(true);
    formData.set("event_id", event.id);
    const result = await updateScheduleEvent(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const result = await deleteScheduleEvent(event.id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setConfirming(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-body-xs text-muted hover:text-brick transition-colors"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-bone">
      <form action={handleUpdate} className="space-y-3">
        {error && (
          <div className="text-body-xs text-brick">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-body-xs text-ash mb-1">Type</label>
            <select
              name="event_type"
              defaultValue={event.event_type}
              className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            >
              {eventTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Date</label>
            <input
              name="event_date"
              type="date"
              defaultValue={event.event_date}
              required
              className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-body-xs text-ash mb-1">Title</label>
          <input
            name="title"
            type="text"
            defaultValue={event.title}
            required
            className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-body-xs text-ash mb-1">Start</label>
            <input
              name="start_time"
              type="time"
              defaultValue={event.start_time?.slice(0, 5) || ""}
              className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">End</label>
            <input
              name="end_time"
              type="time"
              defaultValue={event.end_time?.slice(0, 5) || ""}
              className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Location</label>
            <input
              name="location"
              type="text"
              defaultValue={event.location || ""}
              className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-body-xs text-ash mb-1">Notes</label>
          <textarea
            name="notes"
            defaultValue={event.notes || ""}
            rows={2}
            className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-body-xs text-muted hover:text-brick transition-colors"
            >
              Delete event
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-body-xs text-brick">Are you sure?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1 text-body-xs font-medium text-paper bg-brick rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-body-xs text-muted hover:text-ink transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
