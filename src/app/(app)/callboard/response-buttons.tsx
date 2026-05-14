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
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setShowConflictInput(false);
    setConflictReason("");
    router.refresh();
  }

  return (
    <div>
      {error && (
        <p className="text-body-xs text-brick mb-2">{error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-xs text-muted mr-1">Respond:</span>
        <button
          onClick={() => handleRespond("confirmed")}
          disabled={loading}
          className={`px-3 py-1 text-body-xs font-medium rounded-full border transition-colors ${
            currentStatus === "confirmed"
              ? "border-confirmed bg-confirmed/10 text-confirmed"
              : "border-bone text-ash hover:border-confirmed hover:text-confirmed"
          }`}
        >
          Confirmed
        </button>
        <button
          onClick={() => handleRespond("tentative")}
          disabled={loading}
          className={`px-3 py-1 text-body-xs font-medium rounded-full border transition-colors ${
            currentStatus === "tentative"
              ? "border-tentative bg-tentative/10 text-tentative"
              : "border-bone text-ash hover:border-tentative hover:text-tentative"
          }`}
        >
          Tentative
        </button>
        <button
          onClick={() => handleRespond("conflict")}
          disabled={loading}
          className={`px-3 py-1 text-body-xs font-medium rounded-full border transition-colors ${
            currentStatus === "conflict"
              ? "border-conflict bg-conflict/10 text-conflict"
              : "border-bone text-ash hover:border-conflict hover:text-conflict"
          }`}
        >
          Conflict
        </button>
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
            Submit
          </button>
          <button
            onClick={() => setShowConflictInput(false)}
            className="px-2 py-1.5 text-body-xs text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
