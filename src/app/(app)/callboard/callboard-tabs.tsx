"use client";

import { useState } from "react";

interface ConflictEntry {
  event_id: string;
  event_title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  production_title: string;
  person_name: string;
  person_id: string;
  conflict_reason: string | null;
  responded_at: string;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

export function CallboardTabs({
  scheduleContent,
  conflicts,
  canManage,
}: {
  scheduleContent: React.ReactNode;
  conflicts: ConflictEntry[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"schedule" | "conflicts">("schedule");

  if (!canManage) {
    return <>{scheduleContent}</>;
  }

  // Group conflicts by event
  const byEvent = new Map<string, { event: ConflictEntry; people: ConflictEntry[] }>();
  for (const c of conflicts) {
    if (!byEvent.has(c.event_id)) {
      byEvent.set(c.event_id, { event: c, people: [] });
    }
    byEvent.get(c.event_id)!.people.push(c);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setTab("schedule")}
          className={`px-4 py-2 text-body-sm font-medium rounded-card transition-colors ${
            tab === "schedule" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          Schedule
        </button>
        <button
          onClick={() => setTab("conflicts")}
          className={`px-4 py-2 text-body-sm font-medium rounded-card transition-colors relative ${
            tab === "conflicts" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          Conflicts
          {conflicts.length > 0 && (
            <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full ${
              tab === "conflicts" ? "bg-paper text-ink" : "bg-brick text-paper"
            }`}>
              {conflicts.length}
            </span>
          )}
        </button>
      </div>

      {/* Schedule tab */}
      {tab === "schedule" && scheduleContent}

      {/* Conflicts tab */}
      {tab === "conflicts" && (
        <div>
          {conflicts.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
              <p className="text-body-md text-ash">No conflicts reported for upcoming events.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(byEvent.values()).map(({ event, people }) => (
                <div key={event.event_id} className="bg-card border border-bone rounded-card px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-body-xs font-medium px-1.5 py-0.5 rounded bg-brick/10 text-brick">
                      {event.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-data-sm text-ash">
                      {new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {event.start_time && ` · ${formatTime(event.start_time)}`}
                    </span>
                  </div>
                  <h3 className="text-body-md font-medium text-ink mb-3">
                    {event.event_title}
                    <span className="text-body-xs text-muted font-normal ml-2">{event.production_title}</span>
                  </h3>

                  <div className="space-y-2">
                    {people.map((p) => (
                      <div key={p.person_id} className="flex items-start gap-3 py-1.5 border-t border-bone first:border-0 first:pt-0">
                        <span className="text-body-sm font-medium text-ink shrink-0">
                          {p.person_name}
                        </span>
                        <span className="text-body-sm text-brick">
                          {p.conflict_reason || "No reason given"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
