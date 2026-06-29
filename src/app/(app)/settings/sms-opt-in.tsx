"use client";

import { useState } from "react";
import { setSmsOptIn } from "./sms-actions";

export function SmsOptIn({ optedIn, phone }: { optedIn: boolean; phone: string | null }) {
  const [on, setOn] = useState(optedIn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true); setOn(next);
    const r = await setSmsOptIn(next);
    if (r?.error) setOn(!next);
    setBusy(false);
  }

  return (
    <div className="mt-10 pt-8 border-t border-bone">
      <h3 className="font-display text-display-sm mb-1">Text reminders</h3>
      {!phone ? (
        <p className="text-body-sm text-ash">Add a mobile number to your profile above, then you can turn on call reminders by text.</p>
      ) : (
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={on} disabled={busy} onChange={toggle} className="mt-1 rounded border-bone text-brick focus:ring-brick" />
          <span className="text-body-sm text-ink">Text me call times and reminders at <span className="font-mono">{phone}</span>. About 4&ndash;6 messages a month. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. See our <a href="/sms" className="text-brick hover:underline">SMS terms</a> and <a href="/privacy" className="text-brick hover:underline">privacy policy</a>.</span>
        </label>
      )}
    </div>
  );
}
