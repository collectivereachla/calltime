"use client";

import { useState } from "react";
import { SpineViewer } from "./spine-viewer";
import { LineLab } from "./line-lab";

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

type Tab = "script" | "linelab";

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

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-bone">
        <button
          onClick={() => setTab("script")}
          className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "script"
              ? "border-ink text-ink"
              : "border-transparent text-ash hover:text-ink"
          }`}
        >
          Script
        </button>
        <button
          onClick={() => setTab("linelab")}
          className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "linelab"
              ? "border-ink text-ink"
              : "border-transparent text-ash hover:text-ink"
          }`}
        >
          Line Lab
        </button>
      </div>

      {tab === "script" ? (
        <SpineViewer {...props} />
      ) : (
        <LineLab
          lines={props.lines}
          myCharacters={props.myCharacters}
          allCharacters={props.allCharacters}
          scriptTitle={props.scriptTitle}
        />
      )}
    </div>
  );
}
