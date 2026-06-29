"use client";

import { useState, useMemo } from "react";
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

interface CompanyMember {
  id: string;
  name: string;
  role: string;
  department: string;
}

interface Props {
  productions: { id: string; title: string }[];
  companyMembers: CompanyMember[];
}

const DEPT_ORDER = ["cast", "band", "crew", "production", "other"];
const DEPT_LABELS: Record<string, string> = {
  cast: "Cast", band: "Band", crew: "Crew", production: "Production", other: "Other",
};

export function NewEventForm({ productions, companyMembers }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callEveryone, setCallEveryone] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [times, setTimes] = useState<Record<string, string>>({});
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<Set<number>>(new Set());
  const router = useRouter();

  // Group members by department
  const grouped = useMemo(() => {
    const groups: Record<string, CompanyMember[]> = {};
    for (const dept of DEPT_ORDER) groups[dept] = [];
    for (const m of companyMembers) {
      const d = DEPT_ORDER.includes(m.department) ? m.department : "other";
      groups[d].push(m);
    }
    return DEPT_ORDER.filter((d) => groups[d].length > 0).map((d) => ({
      dept: d, label: DEPT_LABELS[d] || d, members: groups[d].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [companyMembers]);

  function togglePerson(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleRepeatDay(i: number) {
    setRepeatDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function toggleDept(members: CompanyMember[]) {
    const ids = members.map((m) => m.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    // Append selected person IDs if not calling everyone
    if (!callEveryone) {
      for (const id of selectedIds) {
        formData.append("person_ids", id);
      }
      // Per-person call times (staggered calls). Only the ones with a time set.
      const callTimes = [...selectedIds]
        .filter((id) => times[id])
        .map((id) => ({ person_id: id, call_time: times[id] }));
      if (callTimes.length > 0) {
        formData.append("call_times", JSON.stringify(callTimes));
      }
    }

    if (repeat && repeatDays.size > 0) {
      for (const d of repeatDays) formData.append("repeat_days", String(d));
    }

    const result = await createScheduleEvent(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setOpen(false);
    setCallEveryone(true);
    setSelectedIds(new Set());
    setTimes({});
    setRepeat(false);
    setRepeatDays(new Set());
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
      <h3 className="text-body-md font-medium text-ink mb-4">New Event</h3>

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
                <option key={p.id} value={p.id}>{p.title}</option>
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
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Calendar — rehearsal (company-wide) vs production (tagged only) */}
        <div>
          <label className="block text-body-xs text-ash mb-1">Calendar</label>
          <select
            name="kind"
            defaultValue="rehearsal"
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors"
          >
            <option value="rehearsal">Rehearsal — the whole company sees it</option>
            <option value="production">Production — only the people you tag</option>
          </select>
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

        {/* Repeat weekly */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
            />
            <span className="text-body-sm text-ink">Repeat weekly</span>
          </label>
          {repeat && (
            <div className="mt-2 pl-6 space-y-2">
              <div className="flex gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((lbl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleRepeatDay(i)}
                    className={`w-9 h-9 rounded-card border text-body-xs ${repeatDays.has(i) ? "bg-brick text-paper border-brick" : "border-bone text-ash hover:border-ash"}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Repeat until</label>
                <input
                  name="repeat_until"
                  type="date"
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card font-mono text-data-sm text-ink focus:border-brick focus:outline-none transition-colors"
                />
              </div>
              <p className="text-body-xs text-muted">Creates a draft event on each selected weekday through this date. Publish a week to send the calls.</p>
            </div>
          )}
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

        {/* Call toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="call_everyone"
            checked={callEveryone}
            onChange={(e) => setCallEveryone(e.target.checked)}
            className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
          />
          <span className="text-body-sm text-ink">Call entire company</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="mandatory"
            className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
          />
          <span className="text-body-sm text-ink">Mandatory call</span>
          <span className="text-body-xs text-muted">(auto-confirms everyone, no conflicts allowed)</span>
        </label>

        {/* Person picker — shown when not calling everyone */}
        {!callEveryone && companyMembers.length > 0 && (
          <div className="bg-paper border border-bone rounded-card p-4 max-h-64 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-body-xs text-muted">
                {selectedIds.size} of {companyMembers.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(selectedIds.size === companyMembers.length ? new Set() : new Set(companyMembers.map(m => m.id)))}
                className="text-body-xs text-brick hover:text-brick/70 transition-colors"
              >
                {selectedIds.size === companyMembers.length ? "Clear all" : "Select all"}
              </button>
            </div>

            {grouped.map(({ dept, label, members }) => {
              const allInDept = members.every((m) => selectedIds.has(m.id));
              return (
                <div key={dept}>
                  <button
                    type="button"
                    onClick={() => toggleDept(members)}
                    className="flex items-center gap-2 mb-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={allInDept}
                      readOnly
                      className="w-3.5 h-3.5 rounded border-bone text-brick focus:ring-brick"
                    />
                    <span className="text-body-xs font-medium text-ink uppercase tracking-wider">
                      {label} ({members.length})
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-5">
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={() => togglePerson(m.id)}
                          className="w-3.5 h-3.5 rounded border-bone text-brick focus:ring-brick"
                        />
                        <span className="text-body-sm text-ink truncate">{m.name}</span>
                        <span className="text-body-xs text-muted truncate hidden sm:inline">{m.role}</span>
                        {selectedIds.has(m.id) && (
                          <input
                            type="time"
                            value={times[m.id] || ""}
                            onClick={(e) => e.preventDefault()}
                            onChange={(e) => setTimes((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            title="Individual call time (leave blank for event start)"
                            className="ml-auto w-[5.5rem] px-1.5 py-0.5 bg-card border border-bone rounded font-mono text-[11px] text-ink focus:border-brick focus:outline-none"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => { setOpen(false); setCallEveryone(true); setSelectedIds(new Set()); }}
            className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (!callEveryone && selectedIds.size === 0)}
            className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Posting..." : "Post to callboard"}
          </button>
        </div>
      </form>
    </div>
  );
}
