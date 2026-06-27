"use client";

import { useState, useMemo, ReactNode } from "react";
import { toRoman } from "@/lib/roman";
import { useRouter } from "next/navigation";
import {
  scanMentions,
  applyMentionTags,
  addMentionAlias,
  deleteMentionAlias,
  type MentionCandidate,
} from "./spine-actions";

interface ScriptLine {
  id: string;
  line_number: number;
  act: number;
  scene: number;
  line_type: string;
  character: string | null;
  content: string;
  tagged_characters?: string[] | null;
}

interface Props {
  scriptId: string;
  productionId: string;
  lines: ScriptLine[];
  allCharacters: string[];
  aliasesByCharacter: Record<string, string[]>;
  aliasRows: { id: string; character_token: string; alias: string }[];
}

function sceneLabel(act: number | null, scene: number | null): string {
  if (!act || !scene) return "";
  return `Act ${toRoman(act)} · Sc ${scene}`;
}

// Highlight the matched alias within the line so the reviewer sees exactly what
// triggered the candidate.
function highlightAlias(content: string, alias: string): ReactNode {
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(\\b${esc}\\b)`, "gi");
  const parts = content.split(re);
  return parts.map((part, i) =>
    re.test(part) && part.toLowerCase() === alias.toLowerCase() ? (
      <mark key={i} className="bg-amber-100 text-ink rounded px-0.5">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function MentionsReview({ scriptId, productionId, allCharacters, aliasRows }: Props) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<MentionCandidate[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // key → set of approved canonical tokens for that candidate
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  // Alias editor state
  const [newToken, setNewToken] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Group aliases by character for display, carrying ids for deletion.
  const aliasSummary = useMemo(() => {
    const map = new Map<string, { id: string; alias: string }[]>();
    for (const r of aliasRows) {
      const tok = r.character_token.toUpperCase();
      if (!map.has(tok)) map.set(tok, []);
      map.get(tok)!.push({ id: r.id, alias: r.alias });
    }
    return Array.from(map.entries())
      .map(([token, aliases]) => ({ token, aliases }))
      .sort((a, b) => a.token.localeCompare(b.token));
  }, [aliasRows]);

  // An alias that maps to more than one character is ambiguous (reviewed by hand).
  const ambiguousAliases = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const r of aliasRows) {
      const a = r.alias.toLowerCase();
      if (!counts.has(a)) counts.set(a, new Set());
      counts.get(a)!.add(r.character_token.toUpperCase());
    }
    return new Set(Array.from(counts.entries()).filter(([, s]) => s.size > 1).map(([a]) => a));
  }, [aliasRows]);

  async function handleAddAlias() {
    const token = newToken.trim();
    const alias = newAlias.trim();
    if (!token || !alias) {
      setAliasError("Pick a character and type an alias.");
      return;
    }
    setSavingAlias(true);
    setAliasError(null);
    const res = await addMentionAlias(productionId, token, alias);
    setSavingAlias(false);
    if (res.error) {
      setAliasError(res.error);
      return;
    }
    setNewAlias("");
    setNewToken("");
    router.refresh();
  }

  async function handleDeleteAlias(id: string) {
    const res = await deleteMentionAlias(id);
    if (res.error) {
      setAliasError(res.error);
      return;
    }
    router.refresh();
  }

  async function runScan() {
    setScanning(true);
    setMessage(null);
    const res = await scanMentions(scriptId);
    setScanning(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    const found = res.candidates || [];
    setCandidates(found);
    // Pre-approve unambiguous hits; leave ambiguous ones unselected for the
    // reviewer to resolve.
    const init: Record<string, Set<string>> = {};
    for (const c of found) {
      init[c.key] = c.ambiguous ? new Set() : new Set(c.tokens);
    }
    setSelections(init);
    if (found.length === 0) setMessage("No new mentions found. Everything is already tagged.");
  }

  function toggleToken(key: string, token: string, exclusive: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      const cur = new Set(next[key] || []);
      if (exclusive) {
        // ambiguous: a hit refers to one character — picking one clears the other
        if (cur.has(token)) cur.delete(token);
        else { cur.clear(); cur.add(token); }
      } else {
        if (cur.has(token)) cur.delete(token);
        else cur.add(token);
      }
      next[key] = cur;
      return next;
    });
  }

  // Group candidates by alias for a calmer review.
  const groups = useMemo(() => {
    if (!candidates) return [];
    const map = new Map<string, MentionCandidate[]>();
    for (const c of candidates) {
      if (!map.has(c.alias)) map.set(c.alias, []);
      map.get(c.alias)!.push(c);
    }
    return Array.from(map.entries())
      .map(([alias, items]) => ({ alias, items, ambiguous: items[0].ambiguous }))
      .sort((a, b) => Number(b.ambiguous) - Number(a.ambiguous) || a.alias.localeCompare(b.alias));
  }, [candidates]);

  const approvedCount = useMemo(
    () => Object.values(selections).filter((s) => s.size > 0).length,
    [selections]
  );

  async function applyApproved() {
    if (!candidates) return;
    const updates: { lineId: string; tokens: string[] }[] = [];
    for (const c of candidates) {
      const sel = selections[c.key];
      if (sel && sel.size > 0) updates.push({ lineId: c.lineId, tokens: Array.from(sel) });
    }
    if (updates.length === 0) {
      setMessage("Nothing approved to apply.");
      return;
    }
    setApplying(true);
    setMessage(null);
    const res = await applyMentionTags(updates);
    setApplying(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setMessage(`Tagged ${res.updated} line${res.updated === 1 ? "" : "s"}. Re-scanning…`);
    router.refresh();
    await runScan();
  }

  function selectGroup(items: MentionCandidate[], on: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      for (const c of items) {
        next[c.key] = on && !c.ambiguous ? new Set(c.tokens) : new Set();
      }
      return next;
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-body-sm text-ash leading-relaxed">
          Mentions tag a line when a character is named in spoken or sung text — by
          nickname or full name. Tagging is quiet: it never adds chips to the script,
          it just feeds the actors&apos; &ldquo;mentioned in&rdquo; filter. Nothing is
          written until you approve it. Ambiguous hits (one nickname, two characters)
          are flagged for you to resolve.
        </p>
      </div>

      {/* Alias map — editable */}
      <div className="mb-6 rounded-card border border-bone bg-bone/20 p-4">
        <h3 className="font-mono text-data-sm text-muted uppercase tracking-wider mb-2">
          Alias map
        </h3>
        <p className="text-body-xs text-ash mb-3">
          Names a character is called in the script beyond their cast name. An alias
          on more than one character is ambiguous, the scan will ask you to choose per line.
        </p>
        {aliasSummary.length === 0 ? (
          <p className="text-body-sm text-ash mb-3">No aliases defined yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-4">
            {aliasSummary.map((r) => (
              <li key={r.token} className="flex items-start gap-2 text-body-sm">
                <span className="font-mono text-data-sm font-semibold text-ink shrink-0 min-w-[8rem]">
                  {r.token}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {r.aliases.map((a) => (
                    <span
                      key={a.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-body-xs border ${
                        ambiguousAliases.has(a.alias.toLowerCase())
                          ? "border-brick/40 text-brick bg-brick/5"
                          : "border-bone text-ash bg-card"
                      }`}
                    >
                      {a.alias}
                      <button
                        onClick={() => handleDeleteAlias(a.id)}
                        className="hover:text-ink"
                        title="Remove alias"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Add alias row */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-bone">
          <select
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            className="px-2 py-1.5 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
          >
            <option value="">Character…</option>
            {allCharacters.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-ash text-body-sm">is also called</span>
          <input
            type="text"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddAlias(); }}
            placeholder="alias (e.g. JJ)"
            className="px-2 py-1.5 bg-card border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none w-40"
          />
          <button
            onClick={handleAddAlias}
            disabled={savingAlias}
            className="px-3 py-1.5 bg-ink text-paper text-body-sm font-medium rounded hover:bg-ink/90 disabled:opacity-50"
          >
            {savingAlias ? "Adding…" : "Add"}
          </button>
        </div>
        {aliasError && <p className="text-body-xs text-brick mt-2">{aliasError}</p>}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={runScan}
          disabled={scanning || applying}
          className="px-3 py-1.5 bg-ink text-paper text-body-sm font-medium rounded hover:bg-ink/90 disabled:opacity-50"
        >
          {scanning ? "Scanning…" : candidates ? "Re-scan script" : "Scan script for mentions"}
        </button>
        {candidates && candidates.length > 0 && (
          <button
            onClick={applyApproved}
            disabled={applying || approvedCount === 0}
            className="px-3 py-1.5 bg-brick text-paper text-body-sm font-medium rounded hover:bg-brick/90 disabled:opacity-50"
          >
            {applying ? "Applying…" : `Apply ${approvedCount} approved`}
          </button>
        )}
      </div>

      {message && <p className="text-body-sm text-ash mb-4">{message}</p>}

      {candidates && candidates.length > 0 && (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.alias} className="rounded-card border border-bone">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-bone bg-bone/20">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-data-sm font-semibold text-ink">{g.alias}</span>
                  <span className="text-body-xs text-ash">
                    {g.items.length} hit{g.items.length === 1 ? "" : "s"}
                  </span>
                  {g.ambiguous && (
                    <span className="text-body-xs text-brick font-medium">ambiguous — pick one</span>
                  )}
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  {!g.ambiguous && (
                    <button
                      onClick={() => selectGroup(g.items, true)}
                      className="text-body-xs text-ash hover:text-ink"
                    >
                      Approve all
                    </button>
                  )}
                  <button
                    onClick={() => selectGroup(g.items, false)}
                    className="text-body-xs text-ash hover:text-ink"
                  >
                    Skip all
                  </button>
                </div>
              </div>
              <div className="divide-y divide-bone/60">
                {g.items.map((c) => {
                  const sel = selections[c.key] || new Set<string>();
                  return (
                    <div key={c.key} className="px-4 py-3">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-mono text-data-sm text-muted shrink-0">
                          {sceneLabel(c.act, c.scene)}
                        </span>
                        {c.character && (
                          <span className="font-mono text-data-sm text-ash uppercase tracking-wider shrink-0">
                            {c.character}
                          </span>
                        )}
                      </div>
                      <p className="text-body-sm text-ink leading-relaxed mb-2">
                        {highlightAlias(c.content, c.alias)}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.tokens.map((tok) => {
                          const active = sel.has(tok);
                          return (
                            <button
                              key={tok}
                              onClick={() => toggleToken(c.key, tok, c.ambiguous)}
                              className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold uppercase border transition-colors ${
                                active
                                  ? "bg-brick text-paper border-brick"
                                  : "bg-card text-ash border-bone hover:border-ash"
                              }`}
                            >
                              {active ? "✓ " : ""}{tok}
                            </button>
                          );
                        })}
                        {sel.size === 0 && (
                          <span className="text-body-xs text-muted ml-1">skipped</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
