"use client";

import { useState } from "react";
import { toggleRoomLock } from "./actions";

const LOCKABLE_ROOMS = [
  { key: "callboard", name: "Callboard" },
  { key: "company", name: "Company" },
  { key: "spine", name: "Spine" },
  { key: "booth", name: "Booth" },
  { key: "ledger", name: "Ledger" },
];

interface Props {
  activeProduction: { id: string; title: string; locked_rooms: string[] } | null;
}

export function AdminTools({ activeProduction }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedRooms, setLockedRooms] = useState<string[]>(
    activeProduction?.locked_rooms || []
  );

  async function handleReimport() {
    if (
      !confirm(
        "This will reimport the TJS script from the PDF. The Spine will update with 691 lines across 18 scenes. Continue?"
      )
    )
      return;

    setLoading(true);
    setStatus("Importing...");

    try {
      const res = await fetch("/api/admin/reimport-script", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setStatus(
          `Done — ${data.lines_inserted} lines inserted out of ${data.total_parsed}.${data.errors ? " Errors: " + data.errors.join(", ") : ""}`
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`Failed: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (
      !confirm(
        "This will create accounts and send invitation emails to all TJS members who have email addresses but no accounts. Continue?"
      )
    )
      return;

    setLoading(true);
    setStatus("Sending invitations...");

    try {
      const res = await fetch("/api/admin/invite-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionId: "67757468-ebd4-475f-bf30-82709b69e1d8",
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus(
          `Done — ${data.invited} invited, ${data.skipped} skipped, ${data.failed} failed.`
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`Failed: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportNotes() {
    if (
      !confirm(
        "This will import 87 blocking notes from the PDF margins and tag each with the relevant characters. Continue?"
      )
    )
      return;

    setLoading(true);
    setStatus("Importing blocking notes...");

    try {
      const res = await fetch("/api/admin/import-notes", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setStatus(
          `Done — ${data.inserted} notes imported, ${data.failed} failed.${data.failures ? " Issues: " + data.failures.join("; ") : ""}`
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`Failed: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-4">Admin tools</h2>

      {/* Room locks */}
      {activeProduction && (
        <div className="bg-card border border-bone rounded-card p-6 mb-4">
          <h3 className="text-body-sm font-medium text-ink mb-1">Room access — {activeProduction.title}</h3>
          <p className="text-body-xs text-ash mb-3">Locked rooms are hidden from cast and crew.</p>
          <div className="flex flex-wrap gap-2">
            {LOCKABLE_ROOMS.map((room) => {
              const isLocked = lockedRooms.includes(room.key);
              return (
                <button
                  key={room.key}
                  onClick={async () => {
                    const newLocked = !isLocked;
                    setLockedRooms((prev) =>
                      newLocked ? [...prev, room.key] : prev.filter((r) => r !== room.key)
                    );
                    const result = await toggleRoomLock(activeProduction.id, room.key, newLocked);
                    if (result.error) {
                      alert(result.error);
                      setLockedRooms((prev) =>
                        newLocked ? prev.filter((r) => r !== room.key) : [...prev, room.key]
                      );
                    }
                  }}
                  className={`px-3 py-1.5 text-body-xs font-medium rounded-card border transition-colors ${
                    isLocked
                      ? "bg-brick/10 border-brick/30 text-brick"
                      : "bg-confirmed/10 border-confirmed/30 text-confirmed"
                  }`}
                >
                  {isLocked ? "🔒" : "🔓"} {room.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-bone rounded-card p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleReimport}
            disabled={loading}
            className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Working..." : "Reimport TJS Script"}
          </button>

          <button
            onClick={handleInvite}
            disabled={loading}
            className="px-4 py-2 bg-card text-ink text-body-sm font-medium rounded-card border border-bone hover:border-ink transition-colors disabled:opacity-50"
          >
            Invite TJS Members
          </button>

          <button
            onClick={async () => {
              setLoading(true);
              setStatus("Sending test invite to your email...");
              try {
                const res = await fetch("/api/admin/test-invite", { method: "POST" });
                const data = await res.json();
                setStatus(res.ok ? `Done — ${data.message}` : `Error: ${data.error}`);
              } catch (err) {
                setStatus(`Failed: ${err}`);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="px-4 py-2 bg-card text-ink text-body-sm font-medium rounded-card border border-bone hover:border-ink transition-colors disabled:opacity-50"
          >
            Send Test Invite (to me)
          </button>

          <button
            onClick={handleImportNotes}
            disabled={loading}
            className="px-4 py-2 bg-card text-ink text-body-sm font-medium rounded-card border border-bone hover:border-ink transition-colors disabled:opacity-50"
          >
            Import Blocking Notes
          </button>
        </div>

        {status && (
          <div
            className={`text-body-sm rounded-card px-4 py-3 ${
              status.startsWith("Error") || status.startsWith("Failed")
                ? "text-brick bg-brick/5 border border-brick/20"
                : status.startsWith("Done")
                  ? "text-confirmed bg-confirmed/5 border border-confirmed/20"
                  : "text-ash bg-bone/30 border border-bone"
            }`}
          >
            {status}
          </div>
        )}
      </div>
    </section>
  );
}
