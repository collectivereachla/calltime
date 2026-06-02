"use client";

import { useState } from "react";

interface Props {
  orgName: string;
  productionTitle: string | null;
  onShowCount: number;
  totalCount: number;
  defaultScope: "production" | "all";
  children: React.ReactNode;
}

/**
 * Scopes the Company roster between the active production and the full org.
 * The rows are rendered server-side; each row carries data-on-show="true|false".
 * This toggle just flips a class on the wrapper so CSS hides the off-show rows.
 * The full org roster's permanent home is the organization page; this toggle is
 * the interim bridge so the roster is never stranded before that page ships.
 */
export function CompanyScopeToggle({
  orgName,
  productionTitle,
  onShowCount,
  totalCount,
  defaultScope,
  children,
}: Props) {
  const [scope, setScope] = useState<"production" | "all">(defaultScope);

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setScope("production")}
          disabled={!productionTitle}
          className={`px-3 py-1.5 text-body-xs font-medium rounded-full transition-colors disabled:opacity-40 ${
            scope === "production" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          {productionTitle ? `This production (${onShowCount})` : "This production"}
        </button>
        <button
          onClick={() => setScope("all")}
          className={`px-3 py-1.5 text-body-xs font-medium rounded-full transition-colors ${
            scope === "all" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          All of {orgName} ({totalCount})
        </button>
      </div>

      {scope === "production" && productionTitle && (
        <p className="text-body-xs text-muted mb-3">
          Showing the company on{" "}
          <span className="font-display italic text-ash">{productionTitle}</span>. The full
          roster lives under “All of {orgName}.”
        </p>
      )}

      <div data-scope={scope} className="company-roster">
        {children}
      </div>

      <style>{`
        .company-roster[data-scope="production"] [data-on-show="false"] { display: none; }
      `}</style>
    </div>
  );
}
