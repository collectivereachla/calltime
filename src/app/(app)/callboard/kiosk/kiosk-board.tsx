"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkInWithPin, undoCheckIn } from "./kiosk-actions";

interface Call {
  id: string; event_id: string; person_id: string; call_time: string | null;
  checked_in_at: string | null; name: string; role: string | null;
}
interface EventRow {
  id: string; title: string; eventType: string;
  startTime: string | null; endTime: string | null; location: string | null;
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function KioskBoard({
  productionTitle, orgId, today, events, calls,
}: {
  productionTitle: string; orgId: string; today: string;
  events: EventRow[]; calls: Call[];
}) {
  const router = useRouter();
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);

  const callsByEvent = (eventId: string) =>
    calls.filter((c) => c.event_id === eventId)
      .sort((a, b) => {
        // checked-in to the bottom, then by effective time, then name
        if (!!a.checked_in_at !== !!b.checked_in_at) return a.checked_in_at ? 1 : -1;
        const ta = a.call_time || "", tb = b.call_time || "";
        if (ta !== tb) return ta.localeCompare(tb);
        return a.name.localeCompare(b.name);
      });

  const notCheckedIn = calls.filter((c) => !c.checked_in_at);

  function openPad(call: Call) {
    if (call.checked_in_at) return;
    setActiveCall(call);
    setPin("");
    setError(null);
  }

  function pressDigit(d: string) {
    if (pin.length >= 6) return;
    setPin((p) => p + d);
    setError(null);
  }

  async function submitPin() {
    if (!activeCall) return;
    setBusy(true);
    setError(null);
    const res = await checkInWithPin(activeCall.id, pin);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      setPin("");
      return;
    }
    const name = activeCall.name;
    setActiveCall(null);
    setPin("");
    setFlash(`${name} checked in`);
    setTimeout(() => setFlash(null), 2200);
    router.refresh();
  }

  async function handleUndo(call: Call) {
    if (!confirm(`Undo check-in for ${call.name}?`)) return;
    await undoCheckIn(call.id);
    router.refresh();
  }

  const checkedCount = calls.filter((c) => c.checked_in_at).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-display-md text-ink">Check-In</h1>
          <p className="text-body-sm text-ash">
            <span className="font-display italic">{productionTitle}</span>
            {" · "}{new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-display-sm text-ink">{checkedCount}/{calls.length}</p>
          <p className="text-body-xs text-muted">checked in</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setShowRoster(false)}
          className={`px-3 py-1.5 text-body-sm rounded-card ${!showRoster ? "bg-ink text-paper" : "text-ash"}`}
        >
          By call
        </button>
        <button
          onClick={() => setShowRoster(true)}
          className={`px-3 py-1.5 text-body-sm rounded-card relative ${showRoster ? "bg-ink text-paper" : "text-ash"}`}
        >
          Not checked in
          {notCheckedIn.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-bold rounded-full bg-brick text-paper">
              {notCheckedIn.length}
            </span>
          )}
        </button>
        <Link href="/callboard" className="ml-auto px-3 py-1.5 text-body-sm text-ash hover:text-ink">Exit Kiosk</Link>
      </div>

      {flash && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 bg-confirmed text-paper px-5 py-2.5 rounded-card shadow-lg text-body-sm">
          {flash}
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-body-md text-ash text-center py-12">No calls scheduled today.</p>
      ) : showRoster ? (
        <div>
          {notCheckedIn.length === 0 ? (
            <p className="text-body-md text-confirmed text-center py-12">Everyone is checked in.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {notCheckedIn
                .sort((a, b) => (a.call_time || "").localeCompare(b.call_time || "") || a.name.localeCompare(b.name))
                .map((c) => (
                  <button key={c.id} onClick={() => openPad(c)}
                    className="text-left bg-card border border-brick/30 rounded-card px-4 py-3 hover:border-brick transition-colors">
                    <p className="text-body-md text-ink">{c.name}</p>
                    <p className="text-body-xs text-muted">
                      {c.role ? `${c.role} · ` : ""}{fmtTime(c.call_time) || "call"}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {events.map((ev) => {
            const evCalls = callsByEvent(ev.id);
            if (evCalls.length === 0) return null;
            return (
              <section key={ev.id}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-body-md font-medium text-ink">{ev.title}</h2>
                  {fmtTime(ev.startTime) && <span className="text-body-sm text-ash">{fmtTime(ev.startTime)}</span>}
                  {ev.location && <span className="text-body-xs text-muted">· {ev.location}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {evCalls.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => (c.checked_in_at ? handleUndo(c) : openPad(c))}
                      className={`text-left rounded-card px-4 py-3 border transition-colors ${
                        c.checked_in_at
                          ? "bg-confirmed/10 border-confirmed/30"
                          : "bg-card border-bone hover:border-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-body-md text-ink truncate">{c.name}</p>
                        {c.checked_in_at && <span className="text-confirmed text-body-sm shrink-0">✓</span>}
                      </div>
                      <p className="text-body-xs text-muted truncate">
                        {c.call_time ? fmtTime(c.call_time) : (fmtTime(ev.startTime) || "call")}
                        {c.checked_in_at && ` · in ${fmtTime(c.checked_in_at.slice(11, 16))}`}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* PIN pad modal */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4" onClick={() => setActiveCall(null)}>
          <div className="bg-paper rounded-card w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-body-sm text-ash text-center">Checking in</p>
            <p className="text-display-sm text-ink text-center mb-1">{activeCall.name}</p>
            <p className="text-body-xs text-muted text-center mb-4">Enter your PIN</p>

            <div className="flex justify-center gap-2 mb-4 h-7">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? "bg-ink" : "bg-bone"}`} />
              ))}
            </div>

            {error && <p className="text-body-xs text-brick text-center mb-3">{error}</p>}

            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
                <button key={d} onClick={() => pressDigit(d)}
                  className="py-4 text-display-sm text-ink bg-card border border-bone rounded-card hover:bg-bone/40 active:bg-bone">
                  {d}
                </button>
              ))}
              <button onClick={() => setPin((p) => p.slice(0, -1))}
                className="py-4 text-body-md text-ash bg-card border border-bone rounded-card hover:bg-bone/40">←</button>
              <button onClick={() => pressDigit("0")}
                className="py-4 text-display-sm text-ink bg-card border border-bone rounded-card hover:bg-bone/40 active:bg-bone">0</button>
              <button onClick={submitPin} disabled={busy || pin.length < 4}
                className="py-4 text-body-md text-paper bg-ink rounded-card disabled:opacity-40">
                {busy ? "…" : "✓"}
              </button>
            </div>

            <button onClick={() => setActiveCall(null)} className="w-full mt-3 text-body-sm text-ash hover:text-ink">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
