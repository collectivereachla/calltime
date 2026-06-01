"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  saveVideoShot, updateShotStatus, deleteVideoShot,
  saveVideoDeliverable, updateDeliverableStatus, deleteVideoDeliverable,
  saveVideoRelease, updateReleaseStatus, deleteVideoRelease,
} from "./video-actions";
import { saveDesignReference, deleteDesignReference } from "./set-design-actions";

// --- Types ---
interface Scene { id: string; act: number; scene_number: number; title: string | null; }
interface CrewMember { person_id: string; name: string; role_title: string; email: string | null; phone: string | null; }
interface PersonOpt { id: string; name: string; }
interface Shot {
  id: string; title: string; description: string | null; unit: string;
  scene_id: string | null; shot_type: string | null; priority: string; status: string; notes: string | null; sort_order: number;
}
interface Deliverable {
  id: string; title: string; description: string | null; kind: string; destination: string;
  status: string; due_date: string | null; assigned_to: string | null; link_url: string | null; notes: string | null; sort_order: number;
}
interface Release {
  id: string; person_id: string | null; subject_name: string; is_minor: boolean;
  guardian_name: string | null; status: string; signed_at: string | null; notes: string | null;
}
interface Reference {
  id: string; title: string; description: string | null; image_url: string; category: string; created_at: string;
}

interface Props {
  productionId: string;
  scenes: Scene[];
  crew: CrewMember[];
  orgPeople: PersonOpt[];
  shots: Shot[];
  deliverables: Deliverable[];
  releases: Release[];
  references: Reference[];
  canManage: boolean;
}

const PRIORITY = {
  spine: { label: "Spine", color: "bg-brick/10 text-brick" },
  standard: { label: "Standard", color: "bg-ash/10 text-ash" },
  if_time: { label: "If time", color: "bg-muted/20 text-muted" },
};
const SHOT_STATUS = {
  planned: { label: "Planned", color: "bg-ash/10 text-ash" },
  captured: { label: "Captured", color: "bg-confirmed/10 text-confirmed" },
  skipped: { label: "Skipped", color: "bg-muted/20 text-muted line-through" },
};
const DELIV_STATUS = {
  not_started: { label: "Not started", color: "bg-ash/10 text-ash" },
  raw_in: { label: "Raw in", color: "bg-tentative/10 text-tentative" },
  rough_cut: { label: "Rough cut", color: "bg-brick/10 text-brick" },
  final: { label: "Final", color: "bg-brick/20 text-brick" },
  delivered: { label: "Delivered", color: "bg-confirmed/10 text-confirmed" },
};
const RELEASE_STATUS = {
  needed: { label: "Needed", color: "bg-brick/10 text-brick" },
  sent: { label: "Sent", color: "bg-tentative/10 text-tentative" },
  signed: { label: "Signed", color: "bg-confirmed/10 text-confirmed" },
  declined: { label: "Declined", color: "bg-muted/20 text-muted" },
};
const DEST = { marquee: "→ Marquee", archive: "→ Archive", both: "→ Marquee + Archive" };

const inputCls = "w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none";

function sceneLabel(s: Scene) { return `${s.act === 1 ? "I" : "II"}.${s.scene_number}`; }

export function VideoRoom({ productionId, scenes, crew, orgPeople, shots, deliverables, releases, references, canManage }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"crew" | "shots" | "deliverables" | "releases" | "references">("crew");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // ---- Shot form ----
  const [showShotForm, setShowShotForm] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [sTitle, setSTitle] = useState(""); const [sDesc, setSDesc] = useState("");
  const [sUnit, setSUnit] = useState("performance"); const [sScene, setSScene] = useState("");
  const [sType, setSType] = useState(""); const [sPriority, setSPriority] = useState("standard");
  const [sNotes, setSNotes] = useState("");

  function openAddShot() {
    setEditingShot(null); setSTitle(""); setSDesc(""); setSUnit("performance");
    setSScene(""); setSType(""); setSPriority("standard"); setSNotes(""); setShowShotForm(true);
  }
  function openEditShot(s: Shot) {
    setEditingShot(s); setSTitle(s.title); setSDesc(s.description || "");
    setSUnit(s.unit); setSScene(s.scene_id || ""); setSType(s.shot_type || "");
    setSPriority(s.priority); setSNotes(s.notes || ""); setShowShotForm(true);
  }
  async function handleSaveShot() {
    if (!sTitle.trim()) return;
    setSaving(true); setError(null);
    const res = await saveVideoShot({
      id: editingShot?.id, production_id: productionId, title: sTitle.trim(),
      description: sDesc, unit: sUnit, scene_id: sScene || null, shot_type: sType,
      priority: sPriority, status: editingShot?.status, notes: sNotes,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setShowShotForm(false); router.refresh();
  }

  // ---- Deliverable form ----
  const [showDelivForm, setShowDelivForm] = useState(false);
  const [editingDeliv, setEditingDeliv] = useState<Deliverable | null>(null);
  const [dTitle, setDTitle] = useState(""); const [dDesc, setDDesc] = useState("");
  const [dKind, setDKind] = useState("content"); const [dDest, setDDest] = useState("marquee");
  const [dDue, setDDue] = useState(""); const [dAssigned, setDAssigned] = useState("");
  const [dLink, setDLink] = useState(""); const [dNotes, setDNotes] = useState("");

  function openAddDeliv() {
    setEditingDeliv(null); setDTitle(""); setDDesc(""); setDKind("content");
    setDDest("marquee"); setDDue(""); setDAssigned(""); setDLink(""); setDNotes(""); setShowDelivForm(true);
  }
  function openEditDeliv(d: Deliverable) {
    setEditingDeliv(d); setDTitle(d.title); setDDesc(d.description || "");
    setDKind(d.kind); setDDest(d.destination); setDDue(d.due_date || "");
    setDAssigned(d.assigned_to || ""); setDLink(d.link_url || ""); setDNotes(d.notes || ""); setShowDelivForm(true);
  }
  async function handleSaveDeliv() {
    if (!dTitle.trim()) return;
    setSaving(true); setError(null);
    const res = await saveVideoDeliverable({
      id: editingDeliv?.id, production_id: productionId, title: dTitle.trim(),
      description: dDesc, kind: dKind, destination: dDest, status: editingDeliv?.status,
      due_date: dDue || null, assigned_to: dAssigned || null, link_url: dLink, notes: dNotes,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setShowDelivForm(false); router.refresh();
  }

  // ---- Release form ----
  const [showRelForm, setShowRelForm] = useState(false);
  const [editingRel, setEditingRel] = useState<Release | null>(null);
  const [rPerson, setRPerson] = useState(""); const [rName, setRName] = useState("");
  const [rMinor, setRMinor] = useState(false); const [rGuardian, setRGuardian] = useState("");
  const [rNotes, setRNotes] = useState("");

  function openAddRel() {
    setEditingRel(null); setRPerson(""); setRName(""); setRMinor(false); setRGuardian(""); setRNotes(""); setShowRelForm(true);
  }
  function openEditRel(r: Release) {
    setEditingRel(r); setRPerson(r.person_id || ""); setRName(r.subject_name);
    setRMinor(r.is_minor); setRGuardian(r.guardian_name || ""); setRNotes(r.notes || ""); setShowRelForm(true);
  }
  function onPickPerson(id: string) {
    setRPerson(id);
    if (id) { const p = orgPeople.find((o) => o.id === id); if (p) setRName(p.name); }
  }
  async function handleSaveRel() {
    if (!rName.trim()) return;
    setSaving(true); setError(null);
    const res = await saveVideoRelease({
      id: editingRel?.id, production_id: productionId, person_id: rPerson || null,
      subject_name: rName.trim(), is_minor: rMinor, guardian_name: rGuardian,
      status: editingRel?.status, notes: rNotes,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setShowRelForm(false); router.refresh();
  }

  // ---- Reference form ----
  const [showRefForm, setShowRefForm] = useState(false);
  const [refTitle, setRefTitle] = useState(""); const [refDesc, setRefDesc] = useState("");
  const [refCategory, setRefCategory] = useState("shot_list");
  const refImageRef = useRef<HTMLInputElement>(null);

  async function handleSaveRef() {
    const file = refImageRef.current?.files?.[0];
    if (!file || !refTitle.trim()) { setError("Title and file required"); return; }
    setSaving(true); setError(null);
    const fd = new FormData(); fd.append("image", file);
    const res = await saveDesignReference({
      production_id: productionId, department: "video", title: refTitle.trim(),
      description: refDesc || null, category: refCategory, formData: fd,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setShowRefForm(false); setRefTitle(""); setRefDesc(""); setRefCategory("shot_list");
    if (refImageRef.current) refImageRef.current.value = "";
    router.refresh();
  }

  const spineCount = shots.filter((s) => s.priority === "spine").length;
  const deliveredCount = deliverables.filter((d) => d.status === "delivered").length;
  const releasesNeeded = releases.filter((r) => r.status === "needed" || r.status === "sent").length;
  const personName = (id: string | null) => orgPeople.find((p) => p.id === id)?.name || null;

  return (
    <div>
      {/* Intro */}
      <div className="bg-card border border-bone rounded-card px-5 py-4 mb-5">
        <p className="text-body-sm text-ash leading-relaxed">
          The video team&apos;s home. Content crew shoots the Jubilee for <span className="font-medium text-ink">Marquee</span>;
          performance crew records the run for the <span className="font-medium text-ink">Archive</span>. Plan the coverage,
          track the cut, and keep consent in order. Flag the moments that hold the spine so no one&apos;s changing a battery during them.
        </p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {[
          { key: "crew" as const, label: `Crew (${crew.length})` },
          { key: "shots" as const, label: `Shot List (${shots.length})` },
          { key: "deliverables" as const, label: `Deliverables (${deliveredCount}/${deliverables.length})` },
          { key: "releases" as const, label: `Releases${releasesNeeded ? ` (${releasesNeeded} open)` : ""}` },
          { key: "references" as const, label: `References (${references.length})` },
        ].map((t) => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-3 py-1.5 text-body-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              view === t.key ? "bg-ink/10 text-ink" : "text-ash hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-body-xs text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-2 mb-4">{error}</div>
      )}

      {/* ==================== CREW ==================== */}
      {view === "crew" && (
        <div>
          {crew.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No video crew assigned yet.</p>
              <p className="text-body-xs text-muted">Assign people to this production with the <span className="font-mono">video</span> department in Company.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {crew.map((c) => (
                <div key={c.person_id} className="bg-card border border-bone rounded-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brick/10 flex items-center justify-center text-brick text-body-sm font-medium shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-ink truncate">{c.name}</p>
                      <p className="text-body-xs text-muted truncate">{c.role_title}</p>
                    </div>
                  </div>
                  {(c.email || c.phone) && (
                    <div className="mt-2 pt-2 border-t border-bone/50 flex flex-wrap gap-x-4 gap-y-0.5">
                      {c.phone && <a href={`tel:${c.phone}`} className="text-body-xs text-ash hover:text-brick">{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="text-body-xs text-ash hover:text-brick truncate">{c.email}</a>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-body-xs text-muted mt-4">
            Call times, confirmations, and change alerts reach the crew the same way they reach everyone else — through the Callboard. This is the roster, not the schedule.
          </p>
        </div>
      )}

      {/* ==================== SHOT LIST ==================== */}
      {view === "shots" && (
        <div>
          {spineCount > 0 && (
            <p className="text-body-xs text-brick mb-3">
              {spineCount} spine moment{spineCount === 1 ? "" : "s"} flagged — the shots no one misses.
            </p>
          )}
          {canManage && !showShotForm && (
            <button onClick={openAddShot}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add shot
            </button>
          )}
          {showShotForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingShot ? "Edit" : "New"} shot</h3>
              <div>
                <label className="block text-body-xs text-ash mb-1">What to capture</label>
                <input value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="e.g. Isaac's monologue, Act II / Ribbon-cutting / Vendor row b-roll" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Unit</label>
                  <select value={sUnit} onChange={(e) => setSUnit(e.target.value)} className={inputCls}>
                    <option value="performance">Performance (Archive)</option>
                    <option value="event">Event / Jubilee (Marquee)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Priority</label>
                  <select value={sPriority} onChange={(e) => setSPriority(e.target.value)} className={inputCls}>
                    <option value="spine">Spine — do not miss</option>
                    <option value="standard">Standard</option>
                    <option value="if_time">If time</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Scene (optional)</label>
                  <select value={sScene} onChange={(e) => setSScene(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {scenes.map((s) => <option key={s.id} value={s.id}>{sceneLabel(s)}{s.title ? ` · ${s.title}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Shot type (optional)</label>
                  <input value={sType} onChange={(e) => setSType(e.target.value)} placeholder="Wide / Close / B-roll / Interview" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Who to feature, where to stand, sightline cautions..." className={inputCls} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveShot} disabled={saving || !sTitle.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingShot ? "Update" : "Add shot"}
                </button>
                <button onClick={() => setShowShotForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {shots.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No shots planned yet.</p>
              <p className="text-body-xs text-muted">A coverage plan keeps four cameras from all shooting the same thing. Start with the spine moments.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...shots].sort((a, b) => {
                const order = { spine: 0, standard: 1, if_time: 2 } as Record<string, number>;
                return (order[a.priority] - order[b.priority]) || a.sort_order - b.sort_order;
              }).map((s) => {
                const st = SHOT_STATUS[s.status as keyof typeof SHOT_STATUS] || SHOT_STATUS.planned;
                const pr = PRIORITY[s.priority as keyof typeof PRIORITY] || PRIORITY.standard;
                const sc = scenes.find((x) => x.id === s.scene_id);
                return (
                  <div key={s.id} className={`border rounded-card px-4 py-3 group ${s.priority === "spine" ? "border-brick/30 bg-brick/3" : "border-bone bg-card"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-body-xs px-1.5 py-0.5 rounded ${pr.color}`}>{pr.label}</span>
                          <p className="text-body-sm font-medium text-ink">{s.title}</p>
                          {sc && <span className="font-mono text-[10px] text-ash bg-bone/50 px-1 py-0.5 rounded">{sceneLabel(sc)}</span>}
                          {s.shot_type && <span className="text-body-xs text-muted">{s.shot_type}</span>}
                        </div>
                        {s.description && <p className="text-body-xs text-ash mt-1">{s.description}</p>}
                        {s.notes && <p className="text-body-xs text-muted mt-0.5 italic">{s.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canManage ? (
                          <select value={s.status} onChange={(e) => updateShotStatus(s.id, e.target.value).then(() => router.refresh())}
                            className={`text-body-xs px-1.5 py-0.5 rounded border-0 cursor-pointer ${st.color}`}>
                            {Object.entries(SHOT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        ) : <span className={`text-body-xs px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditShot(s)} className="text-body-xs text-ash hover:text-ink">Edit</button>
                        <button onClick={() => deleteVideoShot(s.id).then(() => router.refresh())} className="text-body-xs text-muted hover:text-brick">Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== DELIVERABLES ==================== */}
      {view === "deliverables" && (
        <div>
          {canManage && !showDelivForm && (
            <button onClick={openAddDeliv}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add deliverable
            </button>
          )}
          {showDelivForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingDeliv ? "Edit" : "New"} deliverable</h3>
              <div>
                <label className="block text-body-xs text-ash mb-1">Title</label>
                <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="e.g. 60-sec Jubilee recap / Full archival master / Opening-night sizzle" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Kind</label>
                  <select value={dKind} onChange={(e) => { setDKind(e.target.value); setDDest(e.target.value === "archival" ? "archive" : "marquee"); }} className={inputCls}>
                    <option value="content">Content</option>
                    <option value="archival">Archival</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Lands in</label>
                  <select value={dDest} onChange={(e) => setDDest(e.target.value)} className={inputCls}>
                    <option value="marquee">Marquee</option>
                    <option value="archive">Archive</option>
                    <option value="both">Marquee + Archive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Due date</label>
                  <input type="date" value={dDue} onChange={(e) => setDDue(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Owner</label>
                  <select value={dAssigned} onChange={(e) => setDAssigned(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {crew.map((c) => <option key={c.person_id} value={c.person_id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Delivery link (optional)</label>
                <input value={dLink} onChange={(e) => setDLink(e.target.value)} placeholder="Drive / Frame.io / WeTransfer link" className={inputCls} />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={dNotes} onChange={(e) => setDNotes(e.target.value)} placeholder="Specs, aspect ratio, what it's for..." className={inputCls} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveDeliv} disabled={saving || !dTitle.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingDeliv ? "Update" : "Add deliverable"}
                </button>
                <button onClick={() => setShowDelivForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {deliverables.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No deliverables yet.</p>
              <p className="text-body-xs text-muted">Track each piece from raw footage to delivered, and where it lands.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...deliverables].sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")).map((d) => {
                const st = DELIV_STATUS[d.status as keyof typeof DELIV_STATUS] || DELIV_STATUS.not_started;
                return (
                  <div key={d.id} className="border border-bone bg-card rounded-card px-4 py-3 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-body-sm font-medium text-ink">{d.title}</p>
                          <span className="text-body-xs text-muted">{DEST[d.destination as keyof typeof DEST]}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {d.due_date && <span className="text-body-xs text-ash">Due {new Date(d.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          {d.assigned_to && <span className="text-body-xs text-ash">{personName(d.assigned_to)}</span>}
                          {d.link_url && <a href={d.link_url} target="_blank" rel="noopener noreferrer" className="text-body-xs text-brick hover:underline">Link</a>}
                        </div>
                        {d.notes && <p className="text-body-xs text-muted mt-0.5 italic">{d.notes}</p>}
                      </div>
                      <div className="shrink-0">
                        {canManage ? (
                          <select value={d.status} onChange={(e) => updateDeliverableStatus(d.id, e.target.value).then(() => router.refresh())}
                            className={`text-body-xs px-1.5 py-0.5 rounded border-0 cursor-pointer ${st.color}`}>
                            {Object.entries(DELIV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        ) : <span className={`text-body-xs px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditDeliv(d)} className="text-body-xs text-ash hover:text-ink">Edit</button>
                        <button onClick={() => deleteVideoDeliverable(d.id).then(() => router.refresh())} className="text-body-xs text-muted hover:text-brick">Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== RELEASES ==================== */}
      {view === "releases" && (
        <div>
          <p className="text-body-xs text-muted mb-3">
            Who&apos;s on camera and whether they&apos;ve consented. Minors need a guardian on the release. This protects the people first.
          </p>
          {canManage && !showRelForm && (
            <button onClick={openAddRel}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add release
            </button>
          )}
          {showRelForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingRel ? "Edit" : "New"} release</h3>
              <div>
                <label className="block text-body-xs text-ash mb-1">Company member (optional)</label>
                <select value={rPerson} onChange={(e) => onPickPerson(e.target.value)} className={inputCls}>
                  <option value="">— Not in the company —</option>
                  {orgPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Subject name</label>
                <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Person being filmed" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
                <input type="checkbox" checked={rMinor} onChange={(e) => setRMinor(e.target.checked)} className="rounded border-bone" />
                This subject is a minor
              </label>
              {rMinor && (
                <div>
                  <label className="block text-body-xs text-ash mb-1">Guardian name</label>
                  <input value={rGuardian} onChange={(e) => setRGuardian(e.target.value)} placeholder="Parent / guardian signing" className={inputCls} />
                </div>
              )}
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Context, scope of use..." className={inputCls} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveRel} disabled={saving || !rName.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingRel ? "Update" : "Add release"}
                </button>
                <button onClick={() => setShowRelForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {releases.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No releases tracked yet.</p>
              <p className="text-body-xs text-muted">Add the people who&apos;ll be on camera — cast, crew, and Jubilee subjects.</p>
            </div>
          ) : (
            <div className="border border-bone rounded-card overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-bone/20">
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Subject</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone hidden sm:table-cell">Guardian</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone w-28">Status</th>
                    {canManage && <th className="px-2 py-2 border-b border-bone w-16"></th>}
                  </tr>
                </thead>
                <tbody>
                  {releases.map((r) => {
                    const st = RELEASE_STATUS[r.status as keyof typeof RELEASE_STATUS] || RELEASE_STATUS.needed;
                    return (
                      <tr key={r.id} className="hover:bg-brick/3 transition-colors group">
                        <td className="px-3 py-2.5 border-b border-bone/50">
                          <div className="flex items-center gap-2">
                            <span className="text-body-sm text-ink">{r.subject_name}</span>
                            {r.is_minor && <span className="text-body-xs px-1.5 py-0.5 rounded bg-tentative/10 text-tentative">Minor</span>}
                          </div>
                          {r.notes && <p className="text-body-xs text-muted italic mt-0.5">{r.notes}</p>}
                        </td>
                        <td className="px-3 py-2.5 border-b border-bone/50 text-body-sm text-ash hidden sm:table-cell">{r.guardian_name || (r.is_minor ? "—" : "")}</td>
                        <td className="px-3 py-2.5 border-b border-bone/50">
                          {canManage ? (
                            <select value={r.status} onChange={(e) => updateReleaseStatus(r.id, e.target.value).then(() => router.refresh())}
                              className={`text-body-xs px-1.5 py-0.5 rounded border-0 cursor-pointer ${st.color}`}>
                              {Object.entries(RELEASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          ) : <span className={`text-body-xs px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>}
                        </td>
                        {canManage && (
                          <td className="px-2 py-2.5 border-b border-bone/50">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditRel(r)} className="text-body-xs text-ash hover:text-ink">Edit</button>
                              <button onClick={() => deleteVideoRelease(r.id).then(() => router.refresh())} className="text-body-xs text-muted hover:text-brick">×</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== REFERENCES ==================== */}
      {view === "references" && (
        <div>
          {canManage && !showRefForm && (
            <button onClick={() => setShowRefForm(true)}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Upload reference
            </button>
          )}
          {showRefForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">New reference</h3>
              <div>
                <label className="block text-body-xs text-ash mb-1">Title</label>
                <input value={refTitle} onChange={(e) => setRefTitle(e.target.value)} placeholder="e.g. Run-of-show, Storyboard, Brand usage guide" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Category</label>
                  <select value={refCategory} onChange={(e) => setRefCategory(e.target.value)} className={inputCls}>
                    <option value="shot_list">Shot List / Storyboard</option>
                    <option value="run_of_show">Run of Show</option>
                    <option value="brand">Brand / Usage Guide</option>
                    <option value="reference">Reference / Inspiration</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Image / file</label>
                  <input ref={refImageRef} type="file" accept="image/*" className="w-full text-body-xs text-ash file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-ink file:text-paper" />
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Description</label>
                <input value={refDesc} onChange={(e) => setRefDesc(e.target.value)} placeholder="What this is, how to use it" className={inputCls} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveRef} disabled={saving || !refTitle.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Uploading..." : "Upload"}
                </button>
                <button onClick={() => setShowRefForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {references.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No references yet.</p>
              <p className="text-body-xs text-muted">Upload the run-of-show, storyboards, or brand guidance so the crew works from one plan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {references.map((r) => (
                <div key={r.id} className="border border-bone rounded-card overflow-hidden bg-card group">
                  <button onClick={() => setLightbox(r.image_url)} className="block w-full aspect-video bg-bone/30 overflow-hidden">
                    <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
                  </button>
                  <div className="px-3 py-2">
                    <p className="text-body-sm font-medium text-ink truncate">{r.title}</p>
                    {r.description && <p className="text-body-xs text-muted truncate">{r.description}</p>}
                    {canManage && (
                      <button onClick={() => deleteDesignReference(r.id).then(() => router.refresh())} className="text-body-xs text-muted hover:text-brick mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6 cursor-zoom-out">
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-card" />
        </div>
      )}
    </div>
  );
}
