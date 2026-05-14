"use client";

import { useState } from "react";
import { updateScheduleEvent, deleteScheduleEvent, updateEventCalls } from "./actions";
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

interface PersonInfo {
  id: string;
  name: string;
  role: string;
  department: string;
}

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

interface Props {
  event: EventData;
  calledPersonIds: string[];
  companyMembers: PersonInfo[];
}

export function EditEventButton({ event, calledPersonIds, companyMembers }: Props) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"details" | "calls">("details");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(calledPersonIds));
  const router = useRouter();

  function togglePerson(personId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(companyMembers.map((m) => m.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function selectDepartment(dept: string) {
    const deptIds = companyMembers.filter((m) => m.department === dept).map((m) => m.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = deptIds.every((id) => next.has(id));
      if (allSelected) {
        deptIds.forEach((id) => next.delete(id));
      } else {
        deptIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

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

  async function handleSaveCalls() {
    setError(null);
    setLoading(true);
    const result = await updateEventCalls(event.id, Array.from(selectedIds));
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

  // Group members by department for the call management UI
  const departments = new Map<string, PersonInfo[]>();
  companyMembers.forEach((m) => {
    const dept = m.department;
    if (!departments.has(dept)) departments.set(dept, []);
    departments.get(dept)!.push(m);
  });

  const deptLabels: Record<string, string> = {
    cast: "Cast",
    directing: "Directing",
    stage_management: "Stage Management",
    design: "Design",
    crew: "Crew",
    music: "Music",
    production: "Production",
  };

  const deptOrder = ["cast", "directing", "stage_management", "design", "crew", "music", "production"];

  return (
    <div className="mt-3 pt-3 border-t border-bone">
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab("details")}
          className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${
            tab === "details"
              ? "bg-ink text-paper"
              : "text-ash hover:text-ink"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setTab("calls")}
          className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${
            tab === "calls"
              ? "bg-ink text-paper"
              : "text-ash hover:text-ink"
          }`}
        >
          Who&rsquo;s Called ({selectedIds.size})
        </button>
      </div>

      {error && (
        <div className="text-body-xs text-brick mb-3">{error}</div>
      )}

      {/* Details tab */}
      {tab === "details" && (
        <form action={handleUpdate} className="space-y-3">
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
              rows={3}
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
                <span className="text-body-xs text-brick">Sure?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1 text-body-xs font-medium text-paper bg-brick rounded-card hover:bg-brick/90 disabled:opacity-50"
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
      )}

      {/* Calls tab */}
      {tab === "calls" && (
        <div>
          {/* Quick actions */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAll}
              className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors"
            >
              All
            </button>
            <button
              onClick={selectNone}
              className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors"
            >
              None
            </button>
            {deptOrder.filter((d) => departments.has(d)).map((dept) => (
              <button
                key={dept}
                onClick={() => selectDepartment(dept)}
                className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors"
              >
                {deptLabels[dept] || dept}
              </button>
            ))}
          </div>

          {/* Person list */}
          <div className="max-h-64 overflow-y-auto border border-bone rounded-card divide-y divide-bone bg-paper">
            {deptOrder.filter((d) => departments.has(d)).map((dept) => (
              <div key={dept}>
                <div className="px-3 py-1.5 bg-bone/30">
                  <span className="text-body-xs text-muted uppercase tracking-wider">
                    {deptLabels[dept] || dept}
                  </span>
                </div>
                {departments.get(dept)!.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-brick/5 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(person.id)}
                      onChange={() => togglePerson(person.id)}
                      className="w-3.5 h-3.5 rounded border-bone text-brick focus:ring-brick"
                    />
                    <span className="text-body-sm text-ink flex-1">{person.name}</span>
                    <span className="text-body-xs text-muted">{person.role}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          {/* Save calls */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSaveCalls}
              disabled={loading}
              className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : `Save calls (${selectedIds.size} called)`}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
