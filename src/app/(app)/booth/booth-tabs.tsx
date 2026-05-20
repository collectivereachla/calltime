"use client";

import { useState } from "react";

interface Props {
  costumeContent: React.ReactNode;
  setDesignContent: React.ReactNode;
  lightingContent: React.ReactNode;
  soundContent: React.ReactNode;
  smContent: React.ReactNode;
}

const tabs = [
  { key: "costume" as const, label: "Costume" },
  { key: "set" as const, label: "Set" },
  { key: "lights" as const, label: "Lighting" },
  { key: "sound" as const, label: "Sound" },
  { key: "sm" as const, label: "Stage Mgmt" },
];

type TabKey = typeof tabs[number]["key"];

export function BoothTabs({ costumeContent, setDesignContent, lightingContent, soundContent, smContent }: Props) {
  const [dept, setDept] = useState<TabKey>("costume");

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
      {dept === "lights" && lightingContent}
      {dept === "sound" && soundContent}
      {dept === "sm" && smContent}
    </div>
  );
}
