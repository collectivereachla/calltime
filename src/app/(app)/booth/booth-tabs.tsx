"use client";

import { useState } from "react";

interface TabInfo {
  key: string;
  label: string;
  designer?: string | null;
}

interface Props {
  tabs: TabInfo[];
  contents: Record<string, React.ReactNode>;
}

export function BoothTabs({ tabs, contents }: Props) {
  const [active, setActive] = useState(tabs[0]?.key || "");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-bone pb-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-body-sm font-medium rounded-t-card transition-colors whitespace-nowrap ${
              active === t.key ? "bg-ink text-paper" : "text-ash hover:text-ink"
            }`}
          >
            {t.label}
            {t.designer && (
              <span className={`ml-1.5 text-body-xs font-normal ${
                active === t.key ? "text-paper/60" : "text-muted"
              }`}>
                · {t.designer.split(" ")[0]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        active === t.key ? <div key={t.key}>{contents[t.key]}</div> : null
      ))}
    </div>
  );
}
