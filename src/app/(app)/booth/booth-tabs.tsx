"use client";

import { useState } from "react";

interface Props {
  costumeContent: React.ReactNode;
  smContent: React.ReactNode;
}

export function BoothTabs({ costumeContent, smContent }: Props) {
  const [dept, setDept] = useState<"costume" | "sm">("costume");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-bone pb-2 overflow-x-auto">
        <button
          onClick={() => setDept("costume")}
          className={`px-4 py-2 text-body-sm font-medium rounded-t-card transition-colors whitespace-nowrap ${
            dept === "costume" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          Costume Design
        </button>
        <button
          onClick={() => setDept("sm")}
          className={`px-4 py-2 text-body-sm font-medium rounded-t-card transition-colors whitespace-nowrap ${
            dept === "sm" ? "bg-ink text-paper" : "text-ash hover:text-ink"
          }`}
        >
          Stage Management
        </button>
      </div>

      {dept === "costume" && costumeContent}
      {dept === "sm" && smContent}
    </div>
  );
}
