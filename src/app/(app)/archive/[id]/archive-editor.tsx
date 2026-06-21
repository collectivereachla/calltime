"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProduction, updatePressLinks, reopenProduction, closeProduction } from "../actions";

interface PressLink { title: string; url: string; source?: string; }

interface Props {
  production: {
    id: string; title: string; playwright: string | null; venue: string | null;
    status: string; first_rehearsal: string | null; opening_date: string | null;
    closing_date: string | null; description: string | null; notes: string | null;
    program_url: string | null; press_links: PressLink[];
  };
}

const inputClass = "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

export function ArchiveEditor({ production }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pressLinks, setPressLinks] = useState<PressLink[]>(production.press_links);
  const [showAddPress, setShowAddPress] = useState(false);
  const [newPress, setNewPress] = useState<PressLink>({ title: "", url: "", source: "" });

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const result = await updateProduction(production.id, fd);
    setSaving(false);
    if (result.error) { setStatus(`Error: ${result.error}`); return; }
    setStatus("Saved.");
    setEditing(false);
    router.refresh();
    setTimeout(() => setStatus(null), 2000);
  }

  async function addPressLink() {
    if (!newPress.title.trim() || !newPress.url.trim()) return;
    const updated = [...pressLinks, newPress];
    const result = await updatePressLinks(production.id, updated);
    if (result.error) { setStatus(`Error: ${result.error}`); return; }
    setPressLinks(updated);
    setNewPress({ title: "", url: "", source: "" });
    setShowAddPress(false);
    router.refresh();
  }

  async function removePressLink(idx: number) {
    const updated = pressLinks.filter((_, i) => i !== idx);
    await updatePressLinks(production.id, updated);
    setPressLinks(updated);
    router.refresh();
  }

  async function handleReopen() {
    if (!confirm(`Reopen "${production.title}"? It will appear in the production switcher and become active.`)) return;
    setStatus(null);
    const res = await reopenProduction(production.id);
    if (res?.error) { setStatus(`Couldn't reopen: ${res.error}`); return; }
    router.refresh();
  }

  async function handleClose() {
    if (!confirm(`Close "${production.title}"? It will move to the archive.`)) return;
    setStatus(null);
    const res = await closeProduction(production.id);
    if (res?.error) { setStatus(`Couldn't close: ${res.error}`); return; }
    router.refresh();
  }

  return (
    <div className="mt-8 pt-6 border-t border-bone">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-display-sm">Edit</h2>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">
            Edit details
          </button>
        )}
      </div>

      {status && <p className="text-body-sm text-ash mb-3">{status}</p>}

      {editing && (
        <form onSubmit={handleSave} className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-body-xs text-ash mb-1">Title</label>
              <input name="title" defaultValue={production.title} required className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Playwright</label>
              <input name="playwright" defaultValue={production.playwright || ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Venue</label>
              <input name="venue" defaultValue={production.venue || ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Opening</label>
              <input type="date" name="opening_date" defaultValue={production.opening_date || ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Closing</label>
              <input type="date" name="closing_date" defaultValue={production.closing_date || ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">First Rehearsal</label>
              <input type="date" name="first_rehearsal" defaultValue={production.first_rehearsal || ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Program URL</label>
              <input name="program_url" defaultValue={production.program_url || ""} placeholder="https://..." className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Description</label>
            <textarea name="description" rows={3} defaultValue={production.description || ""} placeholder="A summary of this production..." className={inputClass} />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Notes <span className="text-muted">(private, owners only)</span></label>
            <textarea name="notes" rows={3} defaultValue={production.notes || ""} placeholder="Internal notes, reflections, what you'd do differently..." className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Press links management */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-body-sm font-medium text-ink">Press &amp; Coverage</p>
          <button onClick={() => setShowAddPress(true)} className="text-body-xs text-muted hover:text-ink transition-colors">+ Add link</button>
        </div>
        {pressLinks.length > 0 && (
          <div className="space-y-1.5">
            {pressLinks.map((link, i) => (
              <div key={i} className="flex items-center justify-between bg-card border border-bone rounded-card px-3 py-2">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-body-sm text-brick hover:underline truncate">
                  {link.title}{link.source ? ` — ${link.source}` : ""}
                </a>
                <button onClick={() => removePressLink(i)} className="text-body-xs text-muted hover:text-conflict ml-2 shrink-0">×</button>
              </div>
            ))}
          </div>
        )}
        {showAddPress && (
          <div className="mt-2 space-y-2">
            <input value={newPress.title} onChange={(e) => setNewPress({ ...newPress, title: e.target.value })}
              placeholder="Article title" className={inputClass} />
            <input value={newPress.url} onChange={(e) => setNewPress({ ...newPress, url: e.target.value })}
              placeholder="https://..." className={inputClass} />
            <input value={newPress.source || ""} onChange={(e) => setNewPress({ ...newPress, source: e.target.value })}
              placeholder="Source (e.g. The Current)" className={inputClass} />
            <div className="flex gap-2">
              <button onClick={addPressLink} className="px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90">Add</button>
              <button onClick={() => { setShowAddPress(false); setNewPress({ title: "", url: "", source: "" }); }} className="text-body-xs text-muted">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Reopen / Close */}
      <div className="pt-4 border-t border-bone">
        {production.status === "closed" ? (
          <button onClick={handleReopen} className="text-body-sm text-brick hover:underline">
            Reopen this production →
          </button>
        ) : (
          <button onClick={handleClose} className="text-body-sm text-muted hover:text-conflict">
            Close this production
          </button>
        )}
        {status && <p className="text-body-sm text-conflict mt-2">{status}</p>}
      </div>
    </div>
  );
}
