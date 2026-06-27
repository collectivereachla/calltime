"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuditionSlot, deleteAuditionSlot } from "../actions";

type Signup = { person_id: string; name: string };
type Slot = {
  id: string;
  starts_at: string;
  duration_min: number;
  location: string | null;
  capacity: number;
  notes: string | null;
  signups: Signup[];
};

function fmt(starts: string) {
  return new Date(starts).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function AuditionsCard({ productionId, slots }: { productionId: string; slots: Slot[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState("15");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!startsAt) { setErr("Pick a date and time."); return; }
    setBusy(true); setErr(null);
    const r = await createAuditionSlot({
      productionId,
      startsAt: new Date(startsAt).toISOString(),
      durationMin: parseInt(durationMin, 10) || 15,
      location,
      capacity: parseInt(capacity, 10) || 1,
      notes,
    });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setStartsAt(""); setLocation(""); setNotes(""); setCapacity("1"); setDurationMin("15"); setOpen(false);
    router.refresh();
  }

  async function remove(slotId: string) {
    setBusy(true); setErr(null);
    const r = await deleteAuditionSlot(slotId, productionId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    router.refresh();
  }

  return (
    <section className="mt-8 bg-card border border-bone rounded-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-display-sm text-ink">Auditions</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-body-xs font-medium text-brick hover:underline shrink-0">
          {open ? "Cancel" : "+ Add slot"}
        </button>
      </div>
      <p className="text-body-xs text-ash mb-4">
        Post audition time slots. Anyone who applied through Open Call picks a time.
      </p>

      {open && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-paper border border-bone rounded-card p-4">
          <label className="text-body-xs text-muted">
            Date &amp; time
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-body-sm bg-card border border-bone rounded-card text-ink focus:border-brick focus:outline-none" />
          </label>
          <label className="text-body-xs text-muted">
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Studio A"
              className="mt-1 w-full px-3 py-2 text-body-sm bg-card border border-bone rounded-card text-ink focus:border-brick focus:outline-none" />
          </label>
          <label className="text-body-xs text-muted">
            Length (min)
            <input type="number" min={5} value={durationMin} onChange={(e) => setDurationMin(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-body-sm bg-card border border-bone rounded-card text-ink focus:border-brick focus:outline-none" />
          </label>
          <label className="text-body-xs text-muted">
            Capacity (people)
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-body-sm bg-card border border-bone rounded-card text-ink focus:border-brick focus:outline-none" />
          </label>
          <label className="text-body-xs text-muted sm:col-span-2">
            Notes <span className="text-muted/70">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What to prepare"
              className="mt-1 w-full px-3 py-2 text-body-sm bg-card border border-bone rounded-card text-ink focus:border-brick focus:outline-none" />
          </label>
          <div className="sm:col-span-2">
            <button onClick={add} disabled={busy} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
              {busy ? "Saving…" : "Add audition slot"}
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-body-xs text-brick mb-2">{err}</p>}

      {slots.length === 0 ? (
        <p className="text-body-sm text-muted italic">No audition slots yet.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <div key={s.id} className="border border-bone rounded-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">{fmt(s.starts_at)} <span className="text-muted font-normal">· {s.duration_min} min</span></p>
                  <p className="text-body-xs text-ash">
                    {s.location || "Location TBD"} · {s.signups.length}/{s.capacity} signed up
                  </p>
                  {s.notes && <p className="text-body-xs text-muted mt-0.5">{s.notes}</p>}
                  {s.signups.length > 0 && (
                    <p className="text-body-xs text-ink mt-1">{s.signups.map((u) => u.name).join(", ")}</p>
                  )}
                </div>
                <button onClick={() => remove(s.id)} disabled={busy} className="text-body-xs text-ash hover:text-brick shrink-0">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
