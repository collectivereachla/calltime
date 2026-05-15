"use client";

import { useState, useRef, useEffect } from "react";

interface Scene {
  id: string;
  act: number;
  scene: number;
  title: string | null;
  setting: string | null;
  content: string;
  sort_order: number;
}

interface Props {
  scenes: Scene[];
  scriptTitle: string;
  myCharacters: string[];
  canManage: boolean;
}

function formatSceneContent(content: string, myCharacters: string[]) {
  // Parse plain text script into styled HTML
  const lines = content.split("\n");
  const elements: { type: string; text: string; character?: string }[] = [];

  // Known character names (uppercase, at least 2 chars, on their own line)
  const charPattern = /^([A-Z][A-Z\s.']+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip horizontal rules
    if (/^_{4,}$/.test(trimmed)) continue;

    // Stage directions in parentheses
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      elements.push({ type: "stage_direction", text: trimmed });
      continue;
    }

    // Continued marker
    if (trimmed === "(Cont.)") {
      elements.push({ type: "continued", text: trimmed });
      continue;
    }

    // Setting/AT RISE
    if (trimmed.startsWith("SETTING:") || trimmed.startsWith("AT RISE:")) {
      elements.push({ type: "setting", text: trimmed });
      continue;
    }

    // Song sections (all caps, likely lyrics)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 10 && /[A-Z]{3,}/.test(trimmed) && !charPattern.test(trimmed)) {
      // Check if it looks like a lyric (has multiple words, all caps)
      const words = trimmed.split(/\s+/);
      if (words.length >= 3) {
        elements.push({ type: "lyric", text: trimmed });
        continue;
      }
    }

    // Song direction markers
    if (/^(CALL|CALL\/RESPONSE|VERSE|CHORUS|REFRAIN|OUTRO)(\s|$)/i.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      elements.push({ type: "song_direction", text: trimmed });
      continue;
    }

    // Character name (all caps, on its own line)
    if (charPattern.test(trimmed) && trimmed.length <= 30) {
      // Exclude known non-character all-caps like END OF ACT I
      if (!trimmed.startsWith("END OF") && !trimmed.startsWith("SONG:")) {
        elements.push({ type: "character_name", text: trimmed, character: trimmed });
        continue;
      }
    }

    // Song title (in quotes with emdash)
    if (trimmed.startsWith("\u201c") || trimmed.startsWith("Song:") || trimmed.startsWith('"')) {
      elements.push({ type: "song_title", text: trimmed });
      continue;
    }

    // Default: dialogue or narration
    elements.push({ type: "dialogue", text: trimmed });
  }

  return elements;
}

export function SpineViewer({ scenes, scriptTitle, myCharacters, canManage }: Props) {
  const [activeScene, setActiveScene] = useState(0);
  const [showNav, setShowNav] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Group scenes by act
  const acts = new Map<number, Scene[]>();
  for (const scene of scenes) {
    if (!acts.has(scene.act)) acts.set(scene.act, []);
    acts.get(scene.act)!.push(scene);
  }

  const currentScene = scenes[activeScene];

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeScene]);

  if (!currentScene) return null;

  const elements = formatSceneContent(currentScene.content, myCharacters);

  // Check if a character name is one of the user's characters
  const isMyCharacter = (name: string) => {
    return myCharacters.some((c) =>
      name.toUpperCase().includes(c.toUpperCase().split(" / ")[0]) ||
      name.toUpperCase().includes(c.toUpperCase().split(" / ")[1] || "___NOMATCH___")
    );
  };

  return (
    <div className="flex gap-6">
      {/* Scene navigation — desktop sidebar */}
      <nav className="hidden lg:block w-48 shrink-0">
        <div className="sticky top-24 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {Array.from(acts.entries()).map(([actNum, actScenes]) => (
            <div key={actNum}>
              {actNum > 0 && (
                <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-1">
                  Act {actNum === 1 ? "I" : "II"}
                </h3>
              )}
              <div className="space-y-0.5">
                {actScenes.map((scene) => {
                  const idx = scenes.indexOf(scene);
                  const isActive = idx === activeScene;
                  return (
                    <button
                      key={scene.id}
                      onClick={() => setActiveScene(idx)}
                      className={`block w-full text-left px-2 py-1.5 rounded text-body-sm transition-colors ${
                        isActive
                          ? "bg-ink/10 text-ink font-medium"
                          : "text-ash hover:text-ink hover:bg-ink/5"
                      }`}
                    >
                      {scene.act === 0
                        ? "Front Matter"
                        : `Scene ${scene.scene}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile scene nav toggle */}
      <div className="lg:hidden fixed bottom-20 right-4 z-30">
        <button
          onClick={() => setShowNav(!showNav)}
          className="bg-ink text-paper px-3 py-2 rounded-full text-body-sm font-medium shadow-lg"
        >
          {currentScene.act > 0
            ? `Act ${currentScene.act === 1 ? "I" : "II"} · Scene ${currentScene.scene}`
            : "Scenes"}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {showNav && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/40 z-40"
          onClick={() => setShowNav(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-paper rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-bone rounded mx-auto mb-4" />
            {Array.from(acts.entries()).map(([actNum, actScenes]) => (
              <div key={actNum} className="mb-3">
                {actNum > 0 && (
                  <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-1 px-2">
                    Act {actNum === 1 ? "I" : "II"}
                  </h3>
                )}
                <div className="space-y-0.5">
                  {actScenes.map((scene) => {
                    const idx = scenes.indexOf(scene);
                    const isActive = idx === activeScene;
                    return (
                      <button
                        key={scene.id}
                        onClick={() => {
                          setActiveScene(idx);
                          setShowNav(false);
                        }}
                        className={`block w-full text-left px-3 py-2.5 rounded text-body-md ${
                          isActive
                            ? "bg-ink/10 text-ink font-medium"
                            : "text-ash"
                        }`}
                      >
                        {scene.act === 0
                          ? "Front Matter"
                          : `Scene ${scene.scene}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Script content */}
      <div ref={contentRef} className="flex-1 min-w-0">
        {/* Scene header */}
        <div className="mb-6 pb-4 border-b border-bone">
          <div className="flex items-center gap-3">
            <span className="font-mono text-data-sm text-muted">
              {currentScene.act > 0
                ? `Act ${currentScene.act === 1 ? "I" : "II"} · Scene ${currentScene.scene}`
                : scriptTitle}
            </span>
          </div>
          {currentScene.setting && (
            <p className="text-body-sm text-ash mt-2 italic">
              {currentScene.setting}
            </p>
          )}
        </div>

        {/* Script lines */}
        <div className="space-y-1 pb-12">
          {elements.map((el, i) => {
            switch (el.type) {
              case "character_name":
                return (
                  <p
                    key={i}
                    className={`font-mono text-data-sm uppercase tracking-wider mt-6 mb-0.5 ${
                      isMyCharacter(el.text) ? "text-brick font-bold" : "text-ink font-semibold"
                    }`}
                  >
                    {el.text}
                  </p>
                );
              case "stage_direction":
                return (
                  <p key={i} className="text-body-sm text-ash italic pl-4">
                    {el.text}
                  </p>
                );
              case "continued":
                return (
                  <p key={i} className="text-body-xs text-muted italic pl-4">
                    {el.text}
                  </p>
                );
              case "setting":
                return (
                  <p key={i} className="text-body-sm text-ash italic mt-4 mb-2">
                    {el.text}
                  </p>
                );
              case "song_title":
                return (
                  <p key={i} className="text-body-md font-medium text-ink mt-6 mb-1 italic">
                    {el.text}
                  </p>
                );
              case "song_direction":
                return (
                  <p key={i} className="text-body-xs text-muted uppercase tracking-wider mt-3 mb-1">
                    {el.text}
                  </p>
                );
              case "lyric":
                return (
                  <p key={i} className="text-body-sm text-ash italic pl-6">
                    {el.text}
                  </p>
                );
              default: // dialogue
                return (
                  <p key={i} className="text-body-md text-ink leading-relaxed">
                    {el.text}
                  </p>
                );
            }
          })}
        </div>

        {/* Prev/Next navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-bone">
          <button
            onClick={() => setActiveScene(Math.max(0, activeScene - 1))}
            disabled={activeScene === 0}
            className="text-body-sm text-ash hover:text-ink disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            ← Previous
          </button>
          <span className="font-mono text-data-sm text-muted">
            {activeScene + 1} / {scenes.length}
          </span>
          <button
            onClick={() => setActiveScene(Math.min(scenes.length - 1, activeScene + 1))}
            disabled={activeScene === scenes.length - 1}
            className="text-body-sm text-ash hover:text-ink disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
