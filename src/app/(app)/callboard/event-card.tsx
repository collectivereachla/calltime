"use client";

import { useState } from "react";
import { respondToCall } from "./actions";
import { useRouter } from "next/navigation";

interface CallInfo {
  id: string;
  person_id: string;
  person_name: string;
  response_status: string | null;
  conflict_reason: string | null;
}

interface Props {
  eventCallId: string | null; // null if current user isn't called
  currentStatus: string | null;
  calls: CallInfo[];
  canManage: boolean;
  currentPersonId: string;
}

export function EventCard({ eventCallId, currentStatus, calls, canManage, currentPersonId }: Props) {
  const [activeStatus, setActiveStatus] = useState<string | null>(currentStatus);
  const [callStatuses, setCallStatuses] = useState<Record<string, { status: string; reason: string | null }>>(
    () => {
      const map: Record<string, { status: string; reason: string | null }> = {};
      for (const c of calls) {
        if (c.response_status) {
          map[c.person_id] = { status: c.response_status, reason: c.conflict_reason };
        }
      }
      return map;
    }
  );
  const [inputMode, setInputMode] = useState<"tentative" | "conflict" | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function handleRespond(status: "confirmed" | "tentative" | "conflict") {
    // Confirmed: submit immediately, no text input
    if (status === "confirmed") {
      await submitResponse(status, null);
      return;
    }

    // Tentative and Conflict: show text input first
    if (inputMode !== status) {
      setInputMode(status);
      setReason("");
      return;
    }
  }

  async function submitResponse(status: "confirmed" | "tentative" | "conflict", responseReason: string | null) {
    if (!eventCallId) return;

    setError(null);
    setLoading(true);

    const result = await respondToCall(
      eventCallId,
      status,
      responseReason || undefined
    );

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    // Update local state for instant feedback
    setActiveStatus(status);
    setCallStatuses((prev) => ({
      ...prev,
      [currentPersonId]: { status, reason: responseReason },
    }));
    setInputMode(null);
    setReason("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Background refresh for persistent state
    router.refresh();
  }

  function handleSubmitReason() {
    if (inputMode && reason.trim()) {
      submitResponse(inputMode, reason.trim());
    }
  }

  // Count confirmed
  const confirmedCount = Object.values(callStatuses).filter((r) => r.status === "confirmed").length;
  const totalCalls = calls.length;

  const pillColor = (personId: string) => {
    const resp = callStatuses[personId];
    if (!resp) return "border-bone bg-paper text-muted";
    if (resp.status === "confirmed") return "border-confirmed/30 bg-confirmed/5 text-confirmed";
    if (resp.status === "tentative") return "border-tentative/30 bg-tentative/5 text-tentative";
    if (resp.status === "conflict") return "border-conflict/30 bg-conflict/5 text-conflict";
    return "border-bone bg-paper text-muted";
  };

  const pillIcon = (personId: string) => {
    const resp = callStatuses[personId];
    if (!resp) return "";
    if (resp.status === "confirmed") return " ✓";
    if (resp.status === "tentative") return " ?";
    if (resp.status === "conflict") return " ✕";
    return "";
  };

  return (
    <div>
      {/* Response buttons (if user is called) */}
      {eventCallId && (
        <div className="mt-3 pt-3 border-t border-bone">
          {error && <p className="text-body-xs text-brick mb-2">{error}</p>}
          {saved && <p className="text-body-xs text-confirmed mb-2">Response saved.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-xs text-muted mr-1">Respond:</span>
            <button
              onClick={() => handleRespond("confirmed")}
              disabled={loading}
              className={`px-3 py-1.5 text-body-xs font-medium rounded-full border transition-colors disabled:opacity-50 ${
                activeStatus === "confirmed"
                  ? "border-confirmed bg-confirmed/10 text-confirmed"
                  : "border-bone text-ash active:border-confirmed active:text-confirmed"
              }`}
            >
              {activeStatus === "confirmed" ? "Confirmed ✓" : "Confirmed"}
            </button>
            <button
              onClick={() => handleRespond("tentative")}
              disabled={loading}
              className={`px-3 py-1.5 text-body-xs font-medium rounded-full border transition-colors disabled:opacity-50 ${
                activeStatus === "tentative"
                  ? "border-tentative bg-tentative/10 text-tentative"
                  : "border-bone text-ash active:border-tentative active:text-tentative"
              }`}
            >
              {activeStatus === "tentative" ? "Tentative ?" : "Tentative"}
            </button>
            <button
              onClick={() => handleRespond("conflict")}
              disabled={loading}
              className={`px-3 py-1.5 text-body-xs font-medium rounded-full border transition-colors disabled:opacity-50 ${
                activeStatus === "conflict"
                  ? "border-conflict bg-conflict/10 text-conflict"
                  : "border-bone text-ash active:border-conflict active:text-conflict"
              }`}
            >
              {activeStatus === "conflict" ? "Conflict ✕" : "Conflict"}
            </button>
          </div>

          {/* Reason input for tentative or conflict */}
          {inputMode && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={inputMode === "tentative" ? "What is the potential conflict?" : "What is the conflict?"}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleSubmitReason(); }}
                className="flex-1 px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
              <button
                onClick={handleSubmitReason}
                disabled={loading || !reason.trim()}
                className={`px-3 py-1.5 text-body-xs font-medium rounded-card transition-colors disabled:opacity-50 ${
                  inputMode === "tentative"
                    ? "bg-tentative text-paper hover:bg-tentative/90"
                    : "bg-brick text-paper hover:bg-brick/90"
                }`}
              >
                {loading ? "..." : "Submit"}
              </button>
              <button
                onClick={() => { setInputMode(null); setReason(""); }}
                className="px-2 py-1.5 text-body-xs text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Call list (owner/production only) */}
      {canManage && calls.length > 0 && (
        <details className="mt-3 pt-3 border-t border-bone">
          <summary className="text-body-xs text-muted cursor-pointer hover:text-ash transition-colors">
            {confirmedCount}/{totalCalls} confirmed &middot; {totalCalls} called &middot; tap to view
          </summary>
          <div className="flex flex-wrap gap-2 mt-2">
            {calls.map((call) => (
              <span
                key={call.id}
                className={`text-body-xs px-2 py-0.5 rounded-full border ${pillColor(call.person_id)}`}
                title={callStatuses[call.person_id]?.reason || undefined}
              >
                {call.person_name}{pillIcon(call.person_id)}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
