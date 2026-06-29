"use client";

import { useState } from "react";

export function CallboardTabs({
  scheduleContent,
  availabilityContent,
  canManage,
}: {
  scheduleContent: React.ReactNode;
  availabilityContent?: React.ReactNode;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"schedule" | "availability">("schedule");

  if (!canManage) {
    return <>{scheduleContent}</>;
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 print:hidden">
        <button
          onClick={() => setTab("schedule")}
          className={`px-4 py-2 text-body-sm font-medium rounded-card transition-colors ${
            tab === "schedule" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          Schedule
        </button>
        {availabilityContent && (
          <button
            onClick={() => setTab("availability")}
            className={`px-4 py-2 text-body-sm font-medium rounded-card transition-colors ${
              tab === "availability" ? "bg-ink text-paper" : "text-ash hover:text-ink"
            }`}
          >
            Availability
          </button>
        )}
      </div>

      {/* Schedule tab — always rendered for print */}
      <div className={tab === "schedule" ? "" : "hidden print:block"}>
        {scheduleContent}
      </div>

      {/* Availability tab — company conflict calendar (lead view) */}
      {tab === "availability" && availabilityContent && (
        <div className="print:hidden">{availabilityContent}</div>
      )}
    </div>
  );
}
