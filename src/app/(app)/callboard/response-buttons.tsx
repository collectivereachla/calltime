"use client";

import { useState } from "react";
import { respondToCall } from "./actions";
import { useRouter } from "next/navigation";

interface Props {
  eventCallId: string;
  currentStatus: string | null;
}

export function ResponseButtons({ eventCallId, currentStatus }: Props) {
  const [showConflictInput, setShowConflictInput] = useState(false);
  const [conflictReason, setConflictReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(currentStatus);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function handleRespond(status: "confirmed" | "tentative" | "conflict") {
    if (status === "conflict" && !showConflictInput) {
      setShowConflictInput(true);
      return;
    }

    setError(null);
    setLoading(true);

    const result = await respondToCall(
      eventCallId,
      status,
      status === "conflict" ? conflictReason : undefined
    );

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    // Immediate local update for instant feedback
    setActiveStatus(status);
    setShowConflictInput(false);
    setConflictReason("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Background refresh to update counts and persist across navigation
    router.refresh();
  }

  return (
    <div>
      {error && (
        <p className="text-body-xs text-brick mb-2">{error}</p>
      )}

      {saved && (
        <p className="text-body-xs text-confirmed mb-2">Response saved.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-xs text-muted mr-1">Respond:</span>
        {(["confirmed", "tentative", "conflict"] as const).map((status) => {
          const isActive = activeStatus === status;
          const colors = {
            confirmed: isActive
              ? "border-confirmed bg-confirmed/10 text-confirmed"
              : "border-bone text-ash active:border-confirmed active:text-confirmed",
            tentative: isActive
              ? "border-tentative bg-tentative/10 text-tentative"
              : "border-bone text-ash active:border-tentative active:text-tentative",
            conflict: isActive
              ? "border-conflict bg-conflict/10 text-conflict"
              : "border-bone text-ash active:border-conflict active:text-conflict",
          };

          return (
            <button
              key={status}
              onClick={() => handleRespond(status)}
              disabled={loading}
              className={`px-3 py-1.5 text-body-xs font-medium rounded-full border transition-colors ${colors[status]} disabled:opacity-50`}
            >
              {loading && activeStatus !== status ? status.charAt(0).toUpperCase() + status.slice(1) :
               status === "confirmed" ? (isActive ? "Confirmed ✓" : "Confirmed") :
               status === "tentative" ? (isActive ? "Tentative ?" : "Tentative") :
               status === "conflict" ? (isActive ? "Conflict ✕" : "Conflict") : status}
            </button>
          );
        })}
      </div>

      {showConflictInput && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={conflictReason}
            onChange={(e) => setConflictReason(e.target.value)}
            placeholder="What's the conflict?"
            autoFocus
            className="flex-1 px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
          />
          <button
            onClick={() => handleRespond("conflict")}
            disabled={loading || !conflictReason}
            className="px-3 py-1.5 bg-brick text-paper text-body-xs font-medium rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Submit"}
          </button>
          <button
            onClick={() => { setShowConflictInput(false); setConflictReason(""); }}
            className="px-2 py-1.5 text-body-xs text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
