"use client";

import { useState } from "react";
import { SpineViewer } from "./spine-viewer";
import { LineLab } from "./line-lab";
import { ScriptReports } from "./script-reports";

interface ScriptLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
}

interface Annotation {
  id: string;
  script_line_id: string;
  person_id: string;
  annotation_type: string;
  content: string;
  tagged_characters: string[];
  visibility: string;
  note_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

type Tab = "script" | "linelab" | "reports";

interface Props {
  lines: ScriptLine[];
  sceneMeta: { act: number; scene: number; title: string | null; setting: string | null }[];
  annotations: Annotation[];
  scriptTitle: string;
  scriptId: string;
  myCharacters: string[];
  allCharacters: string[];
  canManage: boolean;
  personId: string;
}

export function SpineLayout(props: Props) {
  const [tab, setTab] = useState<Tab>("script");

  const tabs: { key: Tab; label: string; staffOnly?: boolean }[] = [
    { key: "script", label: "Script" },
    { key: "linelab", label: "Line Lab" },
    { key: "reports", label: "Reports", staffOnly: true },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-bone">
        {tabs
          .filter((t) => !t.staffOnly || props.canManage)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-ink text-ink"
                  : "border-transparent text-ash hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "script" && <SpineViewer {...props} />}
      {tab === "linelab" && (
        <LineLab
          lines={props.lines}
          myCharacters={props.myCharacters}
          allCharacters={props.allCharacters}
          scriptTitle={props.scriptTitle}
        />
      )}
      {tab === "reports" && props.canManage && (
        <ScriptReports
          lines={props.lines}
          annotations={props.annotations}
          allCharacters={props.allCharacters}
        />
      )}
    </div>
  );
}
