"use client";

import { useState } from "react";

export function CalendarLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/${token}`
      : `/api/calendar/${token}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="text-body-xs text-muted uppercase tracking-wider mb-2">
        Calendar subscription
      </p>
      <p className="text-body-sm text-ash mb-3">
        Subscribe in Google Calendar or Apple Calendar. Your schedule updates automatically.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={url}
          className="flex-1 px-3 py-2 bg-card border border-bone rounded-card font-mono text-data-sm text-ash truncate focus:outline-none"
        />
        <button
          onClick={handleCopy}
          className={`px-4 py-2 text-body-xs font-medium rounded-card transition-colors shrink-0 ${
            copied
              ? "bg-confirmed/10 text-confirmed border border-confirmed/20"
              : "bg-ink text-paper hover:bg-ink/90"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
