"use client";

import { useMemo } from "react";

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
  tagged_characters: string[];
  visibility: string;
  note_type: string;
  is_pinned: boolean;
  content: string;
  created_at: string;
}

interface Props {
  lines: ScriptLine[];
  annotations: Annotation[];
  allCharacters: string[];
}

// Same color system as the viewer
const CHARACTER_COLORS = [
  { bg: "bg-red-100", text: "text-red-700", bar: "bg-red-400" },
  { bg: "bg-blue-100", text: "text-blue-700", bar: "bg-blue-400" },
  { bg: "bg-emerald-100", text: "text-emerald-700", bar: "bg-emerald-400" },
  { bg: "bg-purple-100", text: "text-purple-700", bar: "bg-purple-400" },
  { bg: "bg-amber-100", text: "text-amber-700", bar: "bg-amber-400" },
  { bg: "bg-pink-100", text: "text-pink-700", bar: "bg-pink-400" },
  { bg: "bg-cyan-100", text: "text-cyan-700", bar: "bg-cyan-400" },
  { bg: "bg-indigo-100", text: "text-indigo-700", bar: "bg-indigo-400" },
  { bg: "bg-lime-100", text: "text-lime-700", bar: "bg-lime-400" },
  { bg: "bg-rose-100", text: "text-rose-700", bar: "bg-rose-400" },
  { bg: "bg-teal-100", text: "text-teal-700", bar: "bg-teal-400" },
  { bg: "bg-orange-100", text: "text-orange-700", bar: "bg-orange-400" },
  { bg: "bg-violet-100", text: "text-violet-700", bar: "bg-violet-400" },
  { bg: "bg-sky-100", text: "text-sky-700", bar: "bg-sky-400" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-700", bar: "bg-fuchsia-400" },
  { bg: "bg-yellow-100", text: "text-yellow-700", bar: "bg-yellow-400" },
];

function hashChar(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0; }
  return Math.abs(h) % CHARACTER_COLORS.length;
}

function getColor(name: string) { return CHARACTER_COLORS[hashChar(name)]; }

const LINES_PER_MINUTE = 13; // ~1 page of dialogue per minute

export function ScriptReports({ lines, annotations, allCharacters }: Props) {
  const data = useMemo(() => {
    // Filter to real content lines (no front matter)
    const scriptLines = lines.filter((l) => l.act > 0);
    const dialogueLines = scriptLines.filter((l) => l.line_type === "dialogue" && l.character);

    // Scene list
    const sceneKeys: string[] = [];
    const sceneSet = new Set<string>();
    for (const l of scriptLines) {
      const k = l.act + "." + l.scene;
      if (!sceneSet.has(k)) { sceneSet.add(k); sceneKeys.push(k); }
    }

    // Scene labels
    const sceneLabels: Record<string, string> = {};
    for (const k of sceneKeys) {
      const [a, s] = k.split(".").map(Number);
      sceneLabels[k] = (a === 1 ? "I" : "II") + "." + s;
    }

    // Characters (exclude compound names, ALL, BOTH, SOLDIER)
    const chars = allCharacters.filter(
      (c) => !c.includes("/") && c !== "ALL" && c !== "BOTH" && c !== "SOLDIER"
    );

    // Character/Scene matrix
    const matrix: Record<string, Record<string, number>> = {};
    const charTotals: Record<string, number> = {};
    for (const c of chars) { matrix[c] = {}; charTotals[c] = 0; }
    for (const l of dialogueLines) {
      const c = l.character!;
      const k = l.act + "." + l.scene;
      if (matrix[c]) {
        matrix[c][k] = (matrix[c][k] || 0) + 1;
        charTotals[c] = (charTotals[c] || 0) + 1;
      }
    }

    // Sort characters by total lines descending
    const sortedChars = [...chars].sort((a, b) => (charTotals[b] || 0) - (charTotals[a] || 0));

    // Blocking coverage per scene
    const lineIdSet = new Set(scriptLines.map((l) => l.id));
    const annotatedLineIds = new Set(annotations.filter((a) => lineIdSet.has(a.script_line_id)).map((a) => a.script_line_id));

    const sceneCoverage: Record<string, { total: number; blocked: number; notes: number }> = {};
    for (const k of sceneKeys) { sceneCoverage[k] = { total: 0, blocked: 0, notes: 0 }; }
    for (const l of scriptLines) {
      const k = l.act + "." + l.scene;
      if (sceneCoverage[k]) {
        sceneCoverage[k].total++;
        if (annotatedLineIds.has(l.id)) sceneCoverage[k].blocked++;
      }
    }
    for (const a of annotations) {
      const line = scriptLines.find((l) => l.id === a.script_line_id);
      if (line) {
        const k = line.act + "." + line.scene;
        if (sceneCoverage[k]) sceneCoverage[k].notes++;
      }
    }

    // Run time estimates per scene
    const sceneDialogueCounts: Record<string, number> = {};
    for (const k of sceneKeys) sceneDialogueCounts[k] = 0;
    for (const l of dialogueLines) {
      const k = l.act + "." + l.scene;
      sceneDialogueCounts[k] = (sceneDialogueCounts[k] || 0) + 1;
    }

    // Character track: blocking notes tagged to each character
    const charNotes: Record<string, number> = {};
    for (const c of chars) charNotes[c] = 0;
    for (const a of annotations) {
      for (const tag of a.tagged_characters) {
        if (charNotes[tag] !== undefined) charNotes[tag]++;
      }
    }

    // Scene cast lists (for call sheets)
    const sceneCasts: Record<string, string[]> = {};
    for (const k of sceneKeys) sceneCasts[k] = [];
    for (const c of sortedChars) {
      for (const k of sceneKeys) {
        if (matrix[c][k]) sceneCasts[k].push(c);
      }
    }

    // Overall stats
    const totalDialogue = dialogueLines.length;
    const totalScenes = sceneKeys.length;
    const totalNotes = annotations.length;
    const totalBlocked = annotatedLineIds.size;
    const overallCoverage = scriptLines.length > 0 ? Math.round(100 * totalBlocked / scriptLines.length) : 0;
    const estRuntime = Math.round(totalDialogue / LINES_PER_MINUTE);

    return {
      sceneKeys, sceneLabels, sortedChars, matrix, charTotals, charNotes,
      sceneCoverage, sceneDialogueCounts, sceneCasts,
      totalDialogue, totalScenes, totalNotes, overallCoverage, estRuntime,
    };
  }, [lines, annotations, allCharacters]);

  const maxLines = Math.max(...Object.values(data.charTotals), 1);

  return (
    <div className="space-y-10 max-w-5xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Scenes", value: data.totalScenes },
          { label: "Dialogue Lines", value: data.totalDialogue },
          { label: "Blocking Notes", value: data.totalNotes },
          { label: "Coverage", value: data.overallCoverage + "%" },
          { label: "Est. Runtime", value: data.estRuntime + " min" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-bone rounded-card px-4 py-3 text-center">
            <p className="font-mono text-display-sm text-ink">{card.value}</p>
            <p className="text-body-xs text-muted mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Character Line Counts (horizontal bars) */}
      <section>
        <h2 className="font-display text-display-xs text-ink mb-4">Character Tracks</h2>
        <div className="space-y-1.5">
          {data.sortedChars.map((c) => {
            const total = data.charTotals[c] || 0;
            const notes = data.charNotes[c] || 0;
            const color = getColor(c);
            const pct = Math.round(100 * total / maxLines);
            const scenes = data.sceneKeys.filter((k) => data.matrix[c][k]).map((k) => data.sceneLabels[k]);
            return (
              <div key={c} className="flex items-center gap-3">
                <span className={`w-28 shrink-0 text-right font-mono text-[11px] font-semibold uppercase ${color.text}`}>
                  {c}
                </span>
                <div className="flex-1 h-5 bg-bone/30 rounded overflow-hidden relative">
                  <div className={`h-full ${color.bar} rounded transition-all`} style={{ width: pct + "%" }} />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-ink/60">
                    {total} lines · {notes} notes · {scenes.join(", ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Blocking Coverage */}
      <section>
        <h2 className="font-display text-display-xs text-ink mb-4">Blocking Coverage</h2>
        <div className="space-y-1.5">
          {data.sceneKeys.map((k) => {
            const cov = data.sceneCoverage[k];
            const pct = cov.total > 0 ? Math.round(100 * cov.blocked / cov.total) : 0;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-right font-mono text-data-sm text-muted">
                  {data.sceneLabels[k]}
                </span>
                <div className="flex-1 h-5 bg-bone/30 rounded overflow-hidden relative">
                  <div
                    className={`h-full rounded transition-all ${
                      pct >= 30 ? "bg-emerald-400" : pct > 0 ? "bg-amber-400" : "bg-red-300"
                    }`}
                    style={{ width: Math.max(pct, 2) + "%" }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-ink/60">
                    {pct}% ({cov.blocked}/{cov.total} lines) · {cov.notes} notes
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Run Time Estimates */}
      <section>
        <h2 className="font-display text-display-xs text-ink mb-4">Estimated Run Time</h2>
        <p className="text-body-xs text-muted mb-3">Based on ~{LINES_PER_MINUTE} dialogue lines per minute (industry standard ~1 page/min).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-bone">
                <th className="text-left font-mono text-data-sm text-muted py-2 pr-4">Scene</th>
                <th className="text-right font-mono text-data-sm text-muted py-2 px-4">Lines</th>
                <th className="text-right font-mono text-data-sm text-muted py-2 px-4">Est. Time</th>
                <th className="text-right font-mono text-data-sm text-muted py-2 pl-4">Cast</th>
              </tr>
            </thead>
            <tbody>
              {data.sceneKeys.map((k) => {
                const dCount = data.sceneDialogueCounts[k];
                const mins = Math.max(1, Math.round(dCount / LINES_PER_MINUTE));
                const cast = data.sceneCasts[k];
                return (
                  <tr key={k} className="border-b border-bone/50">
                    <td className="py-2 pr-4 font-mono text-data-sm text-ink">{data.sceneLabels[k]}</td>
                    <td className="py-2 px-4 text-right text-ash">{dCount}</td>
                    <td className="py-2 px-4 text-right text-ink font-medium">~{mins} min</td>
                    <td className="py-2 pl-4 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {cast.map((c) => {
                          const color = getColor(c);
                          return (
                            <span key={c} className={`inline-block px-1 py-0 text-[9px] font-mono uppercase rounded ${color.bg} ${color.text}`}>
                              {c}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-bone">
                <td className="py-2 pr-4 font-mono text-data-sm text-ink font-bold">TOTAL</td>
                <td className="py-2 px-4 text-right text-ink font-bold">{data.totalDialogue}</td>
                <td className="py-2 px-4 text-right text-ink font-bold">~{data.estRuntime} min</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Character/Scene Matrix */}
      <section>
        <h2 className="font-display text-display-xs text-ink mb-4">Character/Scene Matrix</h2>
        <p className="text-body-xs text-muted mb-3">Line counts per character per scene. Use for rehearsal call planning.</p>
        <div className="overflow-x-auto">
          <table className="text-[11px] font-mono">
            <thead>
              <tr>
                <th className="sticky left-0 bg-paper z-10 text-left pr-2 py-1 text-muted">Character</th>
                {data.sceneKeys.map((k) => (
                  <th key={k} className="px-1.5 py-1 text-center text-muted whitespace-nowrap">
                    {data.sceneLabels[k]}
                  </th>
                ))}
                <th className="px-2 py-1 text-right text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.sortedChars.map((c) => {
                const color = getColor(c);
                return (
                  <tr key={c} className="border-t border-bone/30">
                    <td className={`sticky left-0 bg-paper z-10 pr-2 py-1 font-semibold uppercase ${color.text}`}>
                      {c}
                    </td>
                    {data.sceneKeys.map((k) => {
                      const count = data.matrix[c][k] || 0;
                      return (
                        <td key={k} className="px-1.5 py-1 text-center">
                          {count > 0 ? (
                            <span className={`inline-block min-w-[20px] px-1 py-0 rounded ${color.bg} ${color.text} font-semibold`}>
                              {count}
                            </span>
                          ) : (
                            <span className="text-bone">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-bold text-ink">{data.charTotals[c]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scene Cast Lists (for call sheets) */}
      <section>
        <h2 className="font-display text-display-xs text-ink mb-4">Scene Call Sheet</h2>
        <p className="text-body-xs text-muted mb-3">Who to call for each scene.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.sceneKeys.map((k) => {
            const cast = data.sceneCasts[k];
            const dCount = data.sceneDialogueCounts[k];
            return (
              <div key={k} className="bg-card border border-bone rounded-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-data-sm text-ink font-semibold">{data.sceneLabels[k]}</span>
                  <span className="font-mono text-[10px] text-muted">{cast.length} actors · {dCount} lines</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cast.map((c) => {
                    const color = getColor(c);
                    return (
                      <span key={c} className={`inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase rounded font-semibold ${color.bg} ${color.text}`}>
                        {c}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
