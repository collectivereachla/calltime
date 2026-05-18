"use client";

import { useState } from "react";

interface Props {
  costumeContent: React.ReactNode;
  setDesignContent: React.ReactNode;
  smContent: React.ReactNode;
}

export function BoothTabs({ costumeContent, setDesignContent, smContent }: Props) {
  const [dept, setDept] = useState<"costume" | "set" | "sm">("costume");

  const tabs = [
    { key: "costume" as const, label: "Costume Design" },
    { key: "set" as const, label: "Set Design" },
    { key: "sm" as const, label: "Stage Management" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-bone pb-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setDept(t.key)}
            className={`px-4 py-2 text-body-sm font-medium rounded-t-card transition-colors whitespace-nowrap ${
              dept === t.key ? "bg-ink text-paper" : "text-ash hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dept === "costume" && costumeContent}
      {dept === "set" && setDesignContent}
      {dept === "sm" && smContent}
    </div>
  );
}
