"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setHiddenRooms } from "./actions";

// Rooms an org may turn off. Home, Callboard, and Company are core and always on.
const HIDEABLE_ROOMS: { key: string; name: string }[] = [
  { key: "greenroom", name: "Greenroom" },
  { key: "spine", name: "Spine" },
  { key: "run", name: "Run" },
  { key: "booth", name: "Booth" },
  { key: "dressing-room", name: "Dressing Room" },
  { key: "marquee", name: "Marquee" },
  { key: "playbill", name: "Playbill" },
  { key: "ledger", name: "Ledger" },
  { key: "seating", name: "Seating" },
  { key: "inventory", name: "Inventory" },
  { key: "applications", name: "Applications" },
  { key: "archive", name: "Archive" },
];

export function RoomVisibility({ orgId, hidden }: { orgId: string; hidden: string[] }) {
  const router = useRouter();
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set(hidden));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function toggle(key: string) {
    const next = new Set(hiddenSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenSet(next);
    setSaving(true);
    setStatus(null);
    const result = await setHiddenRooms(orgId, [...next]);
    setSaving(false);
    if (result?.error) {
      setStatus(result.error);
      setHiddenSet(hiddenSet); // revert
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <h2 className="text-body-md font-medium text-ink mb-1">Rooms</h2>
      <p className="text-body-xs text-ash mb-4">
        Turn off rooms your company doesn&apos;t use. Hidden rooms disappear from the
        sidebar for everyone in this organization. Home, Callboard, and Company stay on.
      </p>
      <div className="bg-card border border-bone rounded-card p-5">
        <div className="flex flex-wrap gap-2">
          {HIDEABLE_ROOMS.map((room) => {
            const on = !hiddenSet.has(room.key);
            return (
              <button
                key={room.key}
                onClick={() => toggle(room.key)}
                disabled={saving}
                className={`px-3 py-1.5 text-body-xs font-medium rounded-card border transition-colors disabled:opacity-50 ${
                  on
                    ? "bg-confirmed/10 border-confirmed/30 text-confirmed"
                    : "bg-bone/30 border-bone text-muted"
                }`}
              >
                {on ? "On" : "Off"} · {room.name}
              </button>
            );
          })}
        </div>
        {status && <p className="text-body-xs text-brick mt-3">{status}</p>}
      </div>
    </section>
  );
}
