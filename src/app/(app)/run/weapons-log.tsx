"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logWeaponCustody } from "./weapons-actions";

export interface WeaponProp {
  id: string;
  prop_name: string;
  scenes: string | null;
  used_by: string | null;
}

export interface CustodyEntry {
  id: string;
  prop_id: string;
  prop_name: string;
  action: string;
  custodian_name: string | null;
  chamber_verified: boolean;
  sm_signature: string | null;
  director_signature: string | null;
  occurred_at: string;
  notes: string | null;
}

export interface RosterPerson {
  id: string;
  name: string;
}

interface Props {
  productionId: string;
  weapons: WeaponProp[];
  entries: CustodyEntry[];
  roster: RosterPerson[];
}

const inputClass =
  "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WeaponsLog({ productionId, weapons, entries, roster }: Props) {
  const router = useRouter();
  const [selectedWeapon, setSelectedWeapon] = useState<string>(weapons[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (weapons.length === 0) {
    return (
      <div className="bg-card border border-bone rounded-card p-6 text-center">
        <p className="text-body-md text-ash">No props are flagged as weapons for this production.</p>
        <p className="text-body-sm text-muted mt-1">
          Flag a prop as a weapon in Booth → Stage Management to track its custody here.
        </p>
      </div>
    );
  }

  const weapon = weapons.find((w) => w.id === selectedWeapon) || weapons[0];
  const weaponEntries = entries.filter((e) => e.prop_id === weapon.id);
  const latest = weaponEntries[0] || null;
  const isOut = latest?.action === "check_out";
  const nextAction = isOut ? "check_in" : "check_out";

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    const result = await logWeaponCustody(formData);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Weapon selector + status */}
      <div className="bg-card border border-bone rounded-card p-5">
        {weapons.length > 1 && (
          <select
            value={weapon.id}
            onChange={(e) => setSelectedWeapon(e.target.value)}
            className={`${inputClass} mb-4`}
          >
            {weapons.map((w) => (
              <option key={w.id} value={w.id}>{w.prop_name}</option>
            ))}
          </select>
        )}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-display-sm">{weapon.prop_name}</h3>
            <p className="text-body-sm text-ash mt-1">
              {weapon.scenes ? `Scenes: ${weapon.scenes}` : ""}
              {weapon.scenes && weapon.used_by ? " · " : ""}
              {weapon.used_by ? `Used by: ${weapon.used_by}` : ""}
            </p>
          </div>
          <span
            className={`text-body-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
              isOut ? "text-conflict bg-conflict/10" : "text-confirmed bg-confirmed/10"
            }`}
          >
            {isOut ? "Checked out" : "In locked storage"}
          </span>
        </div>
        {latest && (
          <p className="text-body-xs text-muted mt-3">
            Last entry: {latest.action === "check_out" ? "checked out" : "checked in"}
            {latest.custodian_name ? ` to ${latest.custodian_name}` : ""} · {formatStamp(latest.occurred_at)}
          </p>
        )}
      </div>

      {/* Log entry form */}
      <div className="bg-card border border-bone rounded-card p-5">
        <p className="text-body-xs text-muted uppercase tracking-wider mb-3">
          {nextAction === "check_out" ? "Check out of locked storage" : "Return to locked storage"}
        </p>
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="production_id" value={productionId} />
          <input type="hidden" name="prop_id" value={weapon.id} />
          <input type="hidden" name="action" value={nextAction} />

          <div>
            <label className="text-body-xs text-ash block mb-1">
              {nextAction === "check_out" ? "Released to" : "Returned by"}
            </label>
            <select name="custodian_person_id" className={inputClass} defaultValue="">
              <option value="">Select person…</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 bg-paper border border-bone rounded-card px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              name="chamber_verified"
              required
              className="mt-0.5 rounded border-bone text-confirmed focus:ring-confirmed shrink-0"
            />
            <span className="text-body-sm text-ink">
              Chamber verified clear by Stage Manager and Director
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-body-xs text-ash block mb-1">Stage Manager signature</label>
              <input name="sm_signature" required placeholder="Type full name" className={inputClass} />
            </div>
            <div>
              <label className="text-body-xs text-ash block mb-1">Director signature</label>
              <input name="director_signature" required placeholder="Type full name" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-body-xs text-ash block mb-1">Notes (optional)</label>
            <input name="notes" placeholder="e.g., pre-show check, end of Act I" className={inputClass} />
          </div>

          {error && <p className="text-body-sm text-conflict">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Logging…" : nextAction === "check_out" ? "Log check-out" : "Log check-in"}
          </button>
        </form>
      </div>

      {/* History */}
      <div>
        <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Custody history</p>
        {weaponEntries.length === 0 ? (
          <p className="text-body-sm text-muted py-2">No entries yet.</p>
        ) : (
          <div className="space-y-1">
            {weaponEntries.map((e) => (
              <div key={e.id} className="bg-card border border-bone rounded-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-body-xs font-medium px-2 py-0.5 rounded-full ${
                      e.action === "check_out"
                        ? "text-conflict bg-conflict/10"
                        : "text-confirmed bg-confirmed/10"
                    }`}
                  >
                    {e.action === "check_out" ? "OUT" : "IN"}
                  </span>
                  <span className="font-mono text-data-sm text-ash">{formatStamp(e.occurred_at)}</span>
                </div>
                <p className="text-body-sm text-ink mt-2">
                  {e.custodian_name
                    ? `${e.action === "check_out" ? "Released to" : "Returned by"} ${e.custodian_name}`
                    : "Custodian not recorded"}
                  {e.chamber_verified ? " · chamber verified" : ""}
                </p>
                <p className="text-body-xs text-muted mt-1">
                  SM: {e.sm_signature || "—"} · Director: {e.director_signature || "—"}
                </p>
                {e.notes && <p className="text-body-xs text-ash mt-1">{e.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
