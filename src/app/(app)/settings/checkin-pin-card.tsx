"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMyCheckinPin } from "./actions";

export function CheckinPinCard({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) { setError("PIN must be 4 to 6 digits."); return; }
    if (pin !== confirm) { setError("The two PINs don't match."); return; }
    setBusy(true);
    const res = await setMyCheckinPin(pin);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setPin(""); setConfirm(""); setDone(true);
    router.refresh();
  }

  return (
    <div className="mt-10 pt-8 border-t border-bone">
      <h2 className="font-display text-display-sm text-ink mb-1">Check-In PIN</h2>
      <p className="text-body-sm text-ash mb-4">
        {hasPin
          ? "You have a PIN set. Enter a new one below to change it."
          : "Set a 4 to 6 digit PIN. You'll enter it on the stage manager's device to check in at the theatre."}
      </p>
      <div className="flex flex-col gap-2 max-w-xs">
        <input
          type="password" inputMode="numeric" autoComplete="off"
          placeholder={hasPin ? "New PIN" : "Choose a PIN"}
          value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setDone(false); }}
          className="px-3 py-2 text-body-sm border border-bone rounded-card bg-paper focus:border-brick focus:outline-none"
        />
        <input
          type="password" inputMode="numeric" autoComplete="off"
          placeholder="Confirm PIN"
          value={confirm} onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6)); setDone(false); }}
          className="px-3 py-2 text-body-sm border border-bone rounded-card bg-paper focus:border-brick focus:outline-none"
        />
        {error && <p className="text-body-xs text-brick">{error}</p>}
        {done && <p className="text-body-xs text-confirmed">PIN saved.</p>}
        <button onClick={save} disabled={busy}
          className="px-4 py-2 text-body-sm font-medium bg-ink text-paper rounded-card hover:bg-ink/90 disabled:opacity-50 self-start">
          {busy ? "Saving…" : hasPin ? "Change PIN" : "Set PIN"}
        </button>
      </div>
    </div>
  );
}
