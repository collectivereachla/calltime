"use client";

import { useState } from "react";
import { respondToCall, removeEventCall, addEventCall } from "./actions";
import { useRouter } from "next/navigation";

interface CallInfo {
  id: string;
  person_id: string;
  person_name: string;
  call_time: string | null;
  response_status: string | null;
  conflict_reason: string | null;
}

function fmtTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

interface CompanyMember {
  id: string;
  name: string;
}

interface Props {
  eventId: string;
  eventCallId: string | null;
  currentStatus: string | null;
  calls: CallInfo[];
  canManage: boolean;
  currentPersonId: string;
  companyMembers: CompanyMember[];
  mandatory?: boolean;
  eventStartTime?: string | null;
}

export function EventCard({ eventId, eventCallId, currentStatus, calls, canManage, currentPersonId, companyMembers, mandatory, eventStartTime }: Props) {
  const [activeStatus, setActiveStatus] = useState<string | null>(currentStatus);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedCalls, setAddedCalls] = useState<CallInfo[]>([]);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
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
        <div className="mt-3 pt-3 border-t border-bone print:hidden">
          {mandatory ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 text-body-xs font-medium rounded-full border border-confirmed bg-confirmed/10 text-confirmed">
                Confirmed ✓
              </span>
              <span className="text-body-xs text-ash font-medium uppercase tracking-wider">Mandatory call</span>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Call list (owner/production only) */}
      {canManage && calls.length > 0 && (
        <>
          <details className="mt-3 pt-3 border-t border-bone print:hidden">
            <summary className="text-body-xs text-muted cursor-pointer hover:text-ash transition-colors">
              {confirmedCount}/{totalCalls - removedIds.size} confirmed &middot; {totalCalls - removedIds.size} called &middot; tap to view
            </summary>
            <div className="flex flex-wrap gap-2 mt-2">
              {[...calls.filter((c) => !removedIds.has(c.id)), ...addedCalls].map((call) => (
                <span
                  key={call.id}
                  className={`text-body-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${pillColor(call.person_id)}`}
                  title={callStatuses[call.person_id]?.reason || undefined}
                >
                  {call.person_name}{call.call_time ? <span className="font-mono text-[10px] text-ash ml-0.5">· {fmtTime(call.call_time)}</span> : ""}{pillIcon(call.person_id)}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setRemovedIds((prev) => new Set([...prev, call.id]));
                      setAddedCalls((prev) => prev.filter((c) => c.id !== call.id));
                      const result = await removeEventCall(call.id);
                      if (result.error) {
                        setRemovedIds((prev) => {
                          const next = new Set(prev);
                          next.delete(call.id);
                          return next;
                        });
                        alert(result.error);
                      }
                    }}
                    className="ml-0.5 text-muted hover:text-brick transition-colors leading-none"
                    title={`Remove ${call.person_name} from this call`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              {/* Add person button */}
              <div className="relative">
                <button
                  onClick={() => setShowAddPicker(!showAddPicker)}
                  className="text-body-xs px-2 py-0.5 rounded-full border border-dashed border-bone text-muted hover:border-ink hover:text-ink transition-colors"
                >
                  + Add
                </button>
                {showAddPicker && (
                  <div className="absolute z-20 top-full left-0 mt-1 w-56 max-h-48 overflow-y-auto bg-card border border-bone rounded-card shadow-lg">
                    {(() => {
                      const calledIds = new Set([
                        ...calls.filter((c) => !removedIds.has(c.id)).map((c) => c.person_id),
                        ...addedCalls.map((c) => c.person_id),
                      ]);
                      const uncalled = companyMembers.filter((m) => !calledIds.has(m.id));
                      if (uncalled.length === 0) {
                        return <p className="px-3 py-2 text-body-xs text-muted">Everyone is already called</p>;
                      }
                      return uncalled.map((member) => (
                        <button
                          key={member.id}
                          disabled={addingId === member.id}
                          onClick={async () => {
                            setAddingId(member.id);
                            const result = await addEventCall(eventId, member.id);
                            setAddingId(null);
                            if (result.error) {
                              alert(result.error);
                            } else {
                              setShowAddPicker(false);
                              router.refresh();
                            }
                          }}
                          className="w-full text-left px-3 py-1.5 text-body-xs text-ink hover:bg-bone/40 transition-colors disabled:opacity-50"
                        >
                          {member.name}
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </details>
          {/* Print-only: always-visible call list, grouped by call time */}
          <div className="hidden print:block mt-2 pt-2 border-t border-bone">
            {(() => {
              // Group people by their effective call time (own time, else event start).
              const groups = new Map<string, CallInfo[]>();
              for (const call of calls) {
                const t = call.call_time || eventStartTime || "";
                if (!groups.has(t)) groups.set(t, []);
                groups.get(t)!.push(call);
              }
              const sortedTimes = [...groups.keys()].sort((a, b) => {
                if (!a) return 1; // unknown/no time sorts last
                if (!b) return -1;
                return a.localeCompare(b);
              });
              const staggered = sortedTimes.filter((t) => t).length > 1;
              return (
                <div className="space-y-1">
                  {sortedTimes.map((t) => (
                    <div key={t || "none"} className="flex gap-2">
                      {staggered && (
                        <span className="font-mono text-body-xs text-ink font-semibold shrink-0 w-16">
                          {t ? `${fmtTime(t)}:` : "Call:"}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {groups.get(t)!.map((call) => (
                          <span
                            key={call.id}
                            className={`text-body-xs px-2 py-0.5 rounded-full border ${pillColor(call.person_id)}`}
                          >
                            {call.person_name}{pillIcon(call.person_id)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
