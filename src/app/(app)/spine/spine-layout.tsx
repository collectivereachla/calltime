"use client";

import { useState } from "react";
import { SpineViewer } from "./spine-viewer";
import { LineLab } from "./line-lab";
import { LineNotes, type LineNote } from "./line-notes";
import { ScriptReports } from "./script-reports";
import { VersionBar } from "./version-bar";

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

export interface ScriptVersion {
  id: string;
  title: string;
  version: string;
  is_locked: boolean;
  version_notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  line_count: number;
  annotation_count: number;
}

type Tab = "script" | "linelab" | "linenotes" | "reports";

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
  versions: ScriptVersion[];
  activeVersionId: string;
  isLocked: boolean;
  productionId: string;
  lineNotes: LineNote[];
  cast: { person_id: string; name: string; role_title: string }[];
}

export function SpineLayout(props: Props) {
  const [tab, setTab] = useState<Tab>("script");

  // Detect monologue: all dialogue lines from a single character
  const dialogueChars = Array.from(
    new Set(
      props.lines
        .filter((l) => l.line_type === "dialogue" && l.character)
        .map((l) => l.character!)
    )
  );
  const isMonologue = dialogueChars.length === 1;
  const soloCharacter = isMonologue ? dialogueChars[0] : null;

  const tabs: { key: Tab; label: string; staffOnly?: boolean }[] = [
    { key: "script", label: "Script" },
    { key: "linelab", label: isMonologue ? "Monologue Lab" : "Line Lab" },
    { key: "linenotes", label: "Line Notes" },
    { key: "reports", label: "Reports", staffOnly: true },
  ];

  return (
    <div>
      {/* Version bar — shown when multiple versions exist or staff can manage */}
      {(props.versions.length > 1 || props.canManage) && (
        <div className="print:hidden">
        <VersionBar
          versions={props.versions}
          activeVersionId={props.activeVersionId}
          isLocked={props.isLocked}
          canManage={props.canManage}
          productionId={props.productionId}
        />
        </div>
      )}

      {/* Locked banner */}
      {props.isLocked && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-4 bg-bone/40 border border-bone rounded-card print:hidden">
          <span className="text-body-xs">🔒</span>
          <span className="text-body-sm text-ash">
            This is a locked version. Annotations are read-only.
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-bone print:hidden">
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
          annotations={props.annotations}
          myCharacters={props.myCharacters}
          allCharacters={props.allCharacters}
          scriptTitle={props.scriptTitle}
          personId={props.personId}
          isMonologue={isMonologue}
          soloCharacter={soloCharacter}
        />
      )}
      {tab === "linenotes" && (
        <LineNotes
          lines={props.lines}
          canManage={props.canManage}
          personId={props.personId}
          productionId={props.productionId}
          notes={props.lineNotes}
          cast={props.cast}
          annotations={props.annotations}
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
