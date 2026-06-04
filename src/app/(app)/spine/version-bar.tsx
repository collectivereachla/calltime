"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createScriptVersion, lockScriptVersion, updateVersionNotes } from "./spine-actions";
import type { ScriptVersion } from "./spine-layout";

interface Props {
  versions: ScriptVersion[];
  activeVersionId: string;
  isLocked: boolean;
  canManage: boolean;
  productionId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function VersionBar({ versions, activeVersionId, isLocked, canManage, productionId }: Props) {
  const router = useRouter();
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [copyAnnotations, setCopyAnnotations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  function switchVersion(id: string) {
    router.push(`/spine?v=${id}`);
  }

  async function handleCreateVersion() {
    if (!newLabel.trim()) return;
    setError(null);
    setSaving(true);
    const result = await createScriptVersion(
      activeVersionId,
      newLabel.trim(),
      newNotes.trim() || null,
      copyAnnotations
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowNewVersion(false);
    setNewLabel("");
    setNewNotes("");
    setCopyAnnotations(false);
    // Navigate to the new version
    if (result.newScriptId) {
      router.push(`/spine?v=${result.newScriptId}`);
    } else {
      router.refresh();
    }
  }

  async function handleToggleLock() {
    setSaving(true);
    const result = await lockScriptVersion(activeVersionId, !isLocked);
    setSaving(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="mb-6">
      {/* Main bar */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-bone">
        {/* Version selector */}
        <div className="flex items-center gap-2">
          <span className="text-body-xs text-muted uppercase tracking-wider">Version</span>
          {versions.length <= 1 ? (
            <span className="font-mono text-data-sm text-ink font-medium">
              {activeVersion?.version || "working"}
            </span>
          ) : (
            <select
              value={activeVersionId}
              onChange={(e) => switchVersion(e.target.value)}
              className="px-2 py-1 bg-card border border-bone rounded text-body-sm text-ink font-medium focus:border-brick focus:outline-none"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version}
                  {v.is_locked ? " 🔒" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Lock badge */}
          {isLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bone/50 text-ash text-body-xs rounded-full font-medium">
              🔒 Locked
            </span>
          )}
        </div>

        {/* Stats */}
        {activeVersion && (
          <div className="flex items-center gap-3 text-body-xs text-muted">
            <span className="font-mono">{activeVersion.line_count} lines</span>
            <span className="font-mono">{activeVersion.annotation_count} notes</span>
            <span>{formatDate(activeVersion.created_at)}</span>
            {activeVersion.created_by_name && (
              <span>by {activeVersion.created_by_name}</span>
            )}
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex items-center gap-2 ml-auto">
            {versions.length > 1 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors"
              >
                History ({versions.length})
              </button>
            )}
            <button
              onClick={handleToggleLock}
              disabled={saving}
              className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors disabled:opacity-50"
            >
              {isLocked ? "Unlock" : "Lock"}
            </button>
            <button
              onClick={() => setShowNewVersion(!showNewVersion)}
              className="px-3 py-1.5 text-body-xs font-medium text-paper bg-ink rounded-full hover:bg-ink/90 transition-colors"
            >
              + New version
            </button>
          </div>
        )}
      </div>

      {/* Version notes */}
      {activeVersion?.version_notes && (
        <p className="text-body-xs text-ash italic mt-2">
          {activeVersion.version_notes}
        </p>
      )}

      {/* New version form */}
      {showNewVersion && canManage && (
        <div className="mt-4 bg-card border border-bone rounded-card p-5">
          <h3 className="text-body-md font-medium text-ink mb-3">Create New Version</h3>
          <p className="text-body-xs text-muted mb-4">
            This duplicates the current script ({activeVersion?.version}) into a new working copy. The current version will be locked.
          </p>

          {error && (
            <div className="text-body-xs text-brick mb-3">{error}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Version name</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. rehearsal-draft-2, tech-final, opening-night"
                className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Notes (optional)</label>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="What changed in this version?"
                className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={copyAnnotations}
                onChange={(e) => setCopyAnnotations(e.target.checked)}
                className="w-4 h-4 rounded border-bone text-brick focus:ring-brick"
              />
              <span className="text-body-sm text-ink">Carry blocking notes forward</span>
              <span className="text-body-xs text-muted">(copy all annotations to new version)</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreateVersion}
                disabled={saving || !newLabel.trim()}
                className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create version"}
              </button>
              <button
                onClick={() => { setShowNewVersion(false); setError(null); }}
                className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version history */}
      {showHistory && (
        <div className="mt-4 bg-card border border-bone rounded-card p-5">
          <h3 className="text-body-md font-medium text-ink mb-4">Version History</h3>
          <div className="space-y-2">
            {versions.map((v) => {
              const isActive = v.id === activeVersionId;
              return (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-card transition-colors ${
                    isActive ? "bg-ink/5 border border-ink/10" : "hover:bg-bone/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-data-sm text-ink font-semibold">
                        {v.version}
                      </span>
                      {v.is_locked && (
                        <span className="text-body-xs text-muted">🔒</span>
                      )}
                      {isActive && (
                        <span className="text-body-xs font-medium text-brick">viewing</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-body-xs text-muted mt-0.5">
                      <span>{formatDate(v.created_at)}</span>
                      {v.created_by_name && <span>by {v.created_by_name}</span>}
                      <span className="font-mono">{v.line_count} lines</span>
                      <span className="font-mono">{v.annotation_count} notes</span>
                    </div>
                    {v.version_notes && (
                      <p className="text-body-xs text-ash italic mt-1">{v.version_notes}</p>
                    )}
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => { switchVersion(v.id); setShowHistory(false); }}
                      className="px-3 py-1 text-body-xs text-ash border border-bone rounded-full hover:text-ink hover:border-ash transition-colors shrink-0"
                    >
                      View
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
