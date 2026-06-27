"use client";

import { useState, useRef } from "react";
import { toRoman } from "@/lib/roman";
import { useRouter } from "next/navigation";
import {
  saveDesignElement, deleteDesignElement, uploadDesignImage,
  saveDesignReference, deleteDesignReference,
  saveSceneDesignNote, toggleMilestone, seedMilestones,
} from "./set-design-actions";
import { saveCue, deleteCue, updateCueStatus } from "./cue-actions";

// --- Types ---

interface Scene {
  id: string; act: number; scene_number: number; title: string | null; location: string | null;
}
interface Element {
  id: string; name: string; description: string | null; status: string;
  image_url: string | null; notes: string | null; scene_ids: string[];
}
interface Reference {
  id: string; title: string; description: string | null; image_url: string;
  category: string; created_at: string;
  file_name?: string | null; mime_type?: string | null;
}
interface Milestone {
  id: string; milestone: string; sort_order: number; completed: boolean;
  completed_at: string | null; notes: string | null;
}
interface Cue {
  id: string; cue_number: string; description: string | null; page_ref: string | null;
  scene_id: string | null; trigger_line: string | null; duration: string | null;
  notes: string | null; status: string; sort_order: number; metadata: Record<string, unknown>;
}

export interface DesignRoomConfig {
  department: string;
  departmentLabel: string;
  designerName: string | null;
  designerRole: string | null;
  // Cue list config
  cuePrefix: string;       // "LX", "SQ"
  cueLabel: string;        // "Cue", "Cue"
  cueLabelPlural: string;  // "Cues"
  cueMetaFields: { key: string; label: string; placeholder: string; type?: string }[];
  // Element config (instruments / equipment)
  elementLabel: string;
  elementLabelPlural: string;
  elementPlaceholder: string;
  elementDescPlaceholder: string;
  elementMetaFields: { key: string; label: string; placeholder: string }[];
  // Reference categories
  referenceCategories: { value: string; label: string }[];
  // Status labels
  statusLabels: Record<string, { label: string; color: string }>;
  cueStatusLabels: Record<string, { label: string; color: string }>;
  // Guidance
  guidance: string[];
}

interface Props {
  config: DesignRoomConfig;
  productionId: string;
  scenes: Scene[];
  elements: Element[];
  references: Reference[];
  milestones: Milestone[];
  cues: Cue[];
  sceneNotes: { scene_id: string; content: string | null }[];
  canManage: boolean;
}

function sceneLabel(s: Scene): string {
  return `${toRoman(s.act)}.${s.scene_number}`;
}

export function DesignRoom({ config, productionId, scenes, elements, references, milestones, cues, sceneNotes, canManage }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"cues" | "equipment" | "scenes" | "references" | "progress">("cues");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Cue form state
  const [showCueForm, setShowCueForm] = useState(false);
  const [editingCue, setEditingCue] = useState<Cue | null>(null);
  const [cueNum, setCueNum] = useState("");
  const [cueDesc, setCueDesc] = useState("");
  const [cuePageRef, setCuePageRef] = useState("");
  const [cueSceneId, setCueSceneId] = useState("");
  const [cueTrigger, setCueTrigger] = useState("");
  const [cueDuration, setCueDuration] = useState("");
  const [cueNotes, setCueNotes] = useState("");
  const [cueMeta, setCueMeta] = useState<Record<string, string>>({});

  // Element form state
  const [showElemForm, setShowElemForm] = useState(false);
  const [editingElem, setEditingElem] = useState<Element | null>(null);
  const [elemName, setElemName] = useState("");
  const [elemDesc, setElemDesc] = useState("");
  const [elemStatus, setElemStatus] = useState("concept");
  const [elemNotes, setElemNotes] = useState("");
  const [elemScenes, setElemScenes] = useState<Set<string>>(new Set());

  // Reference form
  const [showRefForm, setShowRefForm] = useState(false);
  const [refTitle, setRefTitle] = useState("");
  const [refDesc, setRefDesc] = useState("");
  const [refCategory, setRefCategory] = useState("reference");
  const refImageRef = useRef<HTMLInputElement>(null);

  const activeElements = elements.filter((e) => e.status !== "cut");
  const activeCues = cues.filter((c) => c.status !== "cut" as never);

  // --- Cue handlers ---
  function openAddCue() {
    setEditingCue(null);
    const nextNum = cues.length > 0
      ? `${config.cuePrefix} ${Math.max(...cues.map(c => {
          const n = parseFloat(c.cue_number.replace(/[^\d.]/g, ""));
          return isNaN(n) ? 0 : n;
        })) + 1}`
      : `${config.cuePrefix} 1`;
    setCueNum(nextNum);
    setCueDesc(""); setCuePageRef(""); setCueSceneId(""); setCueTrigger("");
    setCueDuration(""); setCueNotes(""); setCueMeta({});
    setShowCueForm(true);
  }
  function openEditCue(c: Cue) {
    setEditingCue(c);
    setCueNum(c.cue_number);
    setCueDesc(c.description || "");
    setCuePageRef(c.page_ref || "");
    setCueSceneId(c.scene_id || "");
    setCueTrigger(c.trigger_line || "");
    setCueDuration(c.duration || "");
    setCueNotes(c.notes || "");
    const meta: Record<string, string> = {};
    for (const f of config.cueMetaFields) meta[f.key] = (c.metadata?.[f.key] as string) || "";
    setCueMeta(meta);
    setShowCueForm(true);
  }
  async function handleSaveCue() {
    if (!cueNum.trim()) return;
    setSaving(true); setError(null);
    const metadata: Record<string, unknown> = {};
    for (const f of config.cueMetaFields) if (cueMeta[f.key]?.trim()) metadata[f.key] = cueMeta[f.key].trim();
    const result = await saveCue({
      id: editingCue?.id,
      production_id: productionId,
      department: config.department,
      cue_number: cueNum.trim(),
      description: cueDesc.trim() || null,
      page_ref: cuePageRef.trim() || null,
      scene_id: cueSceneId || null,
      trigger_line: cueTrigger.trim() || null,
      duration: cueDuration.trim() || null,
      notes: cueNotes.trim() || null,
      metadata,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setShowCueForm(false);
    router.refresh();
  }
  async function handleDeleteCue(id: string) {
    if (!confirm("Delete this cue?")) return;
    await deleteCue(id);
    router.refresh();
  }

  // --- Element handlers ---
  function openAddElem() {
    setEditingElem(null); setElemName(""); setElemDesc(""); setElemStatus("concept");
    setElemNotes(""); setElemScenes(new Set()); setShowElemForm(true);
  }
  function openEditElem(el: Element) {
    setEditingElem(el); setElemName(el.name); setElemDesc(el.description || "");
    setElemStatus(el.status); setElemNotes(el.notes || "");
    setElemScenes(new Set(el.scene_ids)); setShowElemForm(true);
  }
  async function handleSaveElem() {
    if (!elemName.trim()) return;
    setSaving(true); setError(null);
    const result = await saveDesignElement({
      id: editingElem?.id || undefined,
      production_id: productionId, department: config.department,
      name: elemName.trim(), description: elemDesc.trim() || null,
      status: elemStatus, notes: elemNotes.trim() || null,
      scene_ids: Array.from(elemScenes),
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setShowElemForm(false);
    router.refresh();
  }

  // --- Reference handlers ---
  async function handleAddRef() {
    if (!refTitle.trim() || !refImageRef.current?.files?.[0]) return;
    setSaving(true); setError(null);
    const fd = new FormData();
    fd.set("image", refImageRef.current.files[0]);
    const result = await saveDesignReference({
      production_id: productionId, department: config.department,
      title: refTitle.trim(), description: refDesc.trim() || null,
      category: refCategory, formData: fd,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setShowRefForm(false); setRefTitle(""); setRefDesc(""); setRefCategory("reference");
    router.refresh();
  }

  // --- Render ---
  const cueStatusColors = config.cueStatusLabels;

  return (
    <div>
      {/* Designer header */}
      {config.designerName && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-bone">
          <div className="w-8 h-8 rounded-full bg-brick/10 flex items-center justify-center text-brick text-body-sm font-medium">
            {config.designerName.charAt(0)}
          </div>
          <div>
            <p className="text-body-sm font-medium text-ink">{config.designerName}</p>
            <p className="text-body-xs text-muted">{config.designerRole}</p>
          </div>
        </div>
      )}

      {/* Sub-nav */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {[
          { key: "cues" as const, label: `${config.cueLabelPlural} (${activeCues.length})` },
          { key: "equipment" as const, label: `${config.elementLabelPlural} (${activeElements.length})` },
          { key: "scenes" as const, label: "Scene Breakdown" },
          { key: "references" as const, label: `References (${references.length})` },
          { key: "progress" as const, label: `Progress (${milestones.filter(m => m.completed).length}/${milestones.length})` },
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

      {/* ======================== CUE LIST ======================== */}
      {view === "cues" && (
        <div>
          {canManage && !showCueForm && (
            <button onClick={openAddCue}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add {config.cueLabel.toLowerCase()}
            </button>
          )}

          {showCueForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingCue ? "Edit" : "New"} {config.cueLabel}</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">{config.cueLabel} #</label>
                  <input value={cueNum} onChange={(e) => setCueNum(e.target.value)}
                    placeholder={`${config.cuePrefix} 1`}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink font-mono placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Page</label>
                  <input value={cuePageRef} onChange={(e) => setCuePageRef(e.target.value)}
                    placeholder="p. 12"
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink font-mono placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Scene</label>
                  <select value={cueSceneId} onChange={(e) => setCueSceneId(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
                    <option value="">—</option>
                    {scenes.map((s) => <option key={s.id} value={s.id}>{sceneLabel(s)} {s.title || ""}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Description</label>
                <input value={cueDesc} onChange={(e) => setCueDesc(e.target.value)}
                  placeholder="What happens in this cue"
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Trigger</label>
                  <input value={cueTrigger} onChange={(e) => setCueTrigger(e.target.value)}
                    placeholder={`GO on "line text" / Follow ${config.cuePrefix} 1`}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Duration / Count</label>
                  <input value={cueDuration} onChange={(e) => setCueDuration(e.target.value)}
                    placeholder="3 count / snap / 8 sec fade"
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
              </div>
              {/* Department-specific metadata fields */}
              {config.cueMetaFields.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {config.cueMetaFields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-body-xs text-ash mb-1">{f.label}</label>
                      <input value={cueMeta[f.key] || ""} onChange={(e) => setCueMeta(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={cueNotes} onChange={(e) => setCueNotes(e.target.value)}
                  placeholder="SM notes, follow info, safety..."
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveCue} disabled={saving || !cueNum.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingCue ? "Update" : `Add ${config.cueLabel.toLowerCase()}`}
                </button>
                <button onClick={() => setShowCueForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {cues.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash mb-1">No cues yet.</p>
              <p className="text-body-xs text-muted">
                The cue list is the backbone of {config.departmentLabel.toLowerCase()}. Add your first cue to start building the show.
              </p>
            </div>
          ) : (
            <div className="border border-bone rounded-card overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-bone/20">
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase tracking-wider border-b border-bone w-20">#</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone">Description</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone w-20">Page</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone hidden md:table-cell">Trigger</th>
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone w-24">Duration</th>
                    {config.cueMetaFields.slice(0, 2).map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone hidden lg:table-cell">{f.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left text-body-xs text-muted uppercase border-b border-bone w-24">Status</th>
                    {canManage && <th className="px-2 py-2 border-b border-bone w-16"></th>}
                  </tr>
                </thead>
                <tbody>
                  {cues.sort((a, b) => a.sort_order - b.sort_order).map((c) => {
                    const st = cueStatusColors[c.status] || cueStatusColors.concept;
                    const cueScene = scenes.find(s => s.id === c.scene_id);
                    return (
                      <tr key={c.id} className="hover:bg-brick/3 transition-colors group">
                        <td className="px-3 py-2.5 border-b border-bone/50 font-mono text-data-sm text-ink font-semibold">
                          {c.cue_number}
                        </td>
                        <td className="px-3 py-2.5 border-b border-bone/50">
                          <p className="text-body-sm text-ink">{c.description || "—"}</p>
                          {c.notes && <p className="text-body-xs text-muted mt-0.5 italic">{c.notes}</p>}
                          {cueScene && (
                            <span className="font-mono text-[10px] text-ash bg-bone/50 px-1 py-0.5 rounded mt-1 inline-block">
                              {sceneLabel(cueScene)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-bone/50 font-mono text-data-sm text-ash">{c.page_ref || "—"}</td>
                        <td className="px-3 py-2.5 border-b border-bone/50 text-body-xs text-ash hidden md:table-cell">{c.trigger_line || "—"}</td>
                        <td className="px-3 py-2.5 border-b border-bone/50 font-mono text-data-sm text-ash">{c.duration || "—"}</td>
                        {config.cueMetaFields.slice(0, 2).map((f) => (
                          <td key={f.key} className="px-3 py-2.5 border-b border-bone/50 text-body-xs text-ash hidden lg:table-cell">
                            {(c.metadata?.[f.key] as string) || "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 border-b border-bone/50">
                          {canManage ? (
                            <select value={c.status} onChange={(e) => updateCueStatus(c.id, e.target.value).then(() => router.refresh())}
                              className={`text-body-xs px-1.5 py-0.5 rounded border-0 cursor-pointer ${st.color}`}>
                              {Object.entries(cueStatusColors).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          ) : (
                            <span className={`text-body-xs px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-2 py-2.5 border-b border-bone/50">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditCue(c)} className="text-body-xs text-ash hover:text-ink">Edit</button>
                              <button onClick={() => handleDeleteCue(c.id)} className="text-body-xs text-muted hover:text-brick">×</button>
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

      {/* ======================== EQUIPMENT ======================== */}
      {view === "equipment" && (
        <div>
          {canManage && !showElemForm && (
            <button onClick={openAddElem}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Add {config.elementLabel.toLowerCase()}
            </button>
          )}
          {showElemForm && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingElem ? "Edit" : "New"} {config.elementLabel.toLowerCase()}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Name</label>
                  <input value={elemName} onChange={(e) => setElemName(e.target.value)} placeholder={config.elementPlaceholder}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Status</label>
                  <select value={elemStatus} onChange={(e) => setElemStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
                    {Object.entries(config.statusLabels).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Description</label>
                <textarea value={elemDesc} onChange={(e) => setElemDesc(e.target.value)} rows={2} placeholder={config.elementDescPlaceholder}
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none" />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Scenes</label>
                <div className="flex flex-wrap gap-1.5">
                  {scenes.map((s) => (
                    <button key={s.id} onClick={() => {
                      setElemScenes(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
                    }} className={`px-2 py-1 text-body-xs rounded-full border transition-colors ${
                      elemScenes.has(s.id) ? "bg-ink text-paper border-ink" : "border-bone text-ash hover:border-ash"
                    }`}>{sceneLabel(s)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={elemNotes} onChange={(e) => setElemNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveElem} disabled={saving || !elemName.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingElem ? "Update" : "Add"}
                </button>
                <button onClick={() => setShowElemForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink">Cancel</button>
              </div>
            </div>
          )}
          {elements.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No {config.elementLabelPlural.toLowerCase()} added yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map((el) => {
                const s = config.statusLabels[el.status] || config.statusLabels.concept;
                const elScenes = scenes.filter((sc) => el.scene_ids.includes(sc.id));
                return (
                  <div key={el.id} className="bg-card border border-bone rounded-card px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 min-w-0">
                        {el.image_url ? (
                          <img src={el.image_url} alt="" onClick={() => setLightbox(el.image_url)}
                            className="w-14 h-14 rounded-card object-cover shrink-0 cursor-pointer border border-bone" />
                        ) : canManage ? (
                          <label className="w-14 h-14 rounded-card border border-dashed border-bone flex items-center justify-center text-muted text-[10px] cursor-pointer hover:border-ash shrink-0">
                            + img
                            <input type="file" accept="image/*" className="hidden"
                              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("image", f); await uploadDesignImage(el.id, fd); router.refresh(); }} />
                          </label>
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-body-sm font-medium text-ink">{el.name}</h3>
                            <span className={`text-body-xs px-1.5 py-0.5 rounded ${s.color}`}>{s.label}</span>
                          </div>
                          {el.description && <p className="text-body-xs text-ash">{el.description}</p>}
                          {elScenes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {elScenes.map(sc => <span key={sc.id} className="font-mono text-[10px] px-1 py-0.5 bg-bone/50 text-ash rounded">{sceneLabel(sc)}</span>)}
                            </div>
                          )}
                          {el.notes && <p className="text-[10px] text-muted mt-1 italic">{el.notes}</p>}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => openEditElem(el)} className="text-body-xs text-ash hover:text-ink">Edit</button>
                          <button onClick={async () => { if (confirm("Delete?")) { await deleteDesignElement(el.id); router.refresh(); } }} className="text-body-xs text-muted hover:text-brick">×</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================== SCENE BREAKDOWN ======================== */}
      {view === "scenes" && (
        <div className="space-y-3">
          <p className="text-body-xs text-muted mb-2">
            Scene-by-scene {config.departmentLabel.toLowerCase()} notes. What does the audience experience in each moment?
          </p>
          {scenes.map((scene) => {
            const note = sceneNotes.find((n) => n.scene_id === scene.id);
            const sceneCues = cues.filter(c => c.scene_id === scene.id);
            return (
              <div key={scene.id} className="bg-card border border-bone rounded-card px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-data-sm text-ink font-semibold">{sceneLabel(scene)}</span>
                  {scene.title && <span className="text-body-sm text-ash">{scene.title}</span>}
                </div>
                {scene.location && (
                  <p className="text-body-sm text-ink mt-1">
                    <span className="text-muted">Location:</span> <span className="font-medium">{scene.location}</span>
                  </p>
                )}
                {sceneCues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {sceneCues.map((c) => (
                      <span key={c.id} className="font-mono text-[10px] px-1.5 py-0.5 bg-brick/8 text-brick rounded">
                        {c.cue_number}{c.description ? ` — ${c.description}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {canManage ? (
                  <div className="mt-3">
                    <EditableNote
                      value={note?.content || ""}
                      placeholder={`${config.departmentLabel} notes for this scene...`}
                      onSave={(content) => saveSceneDesignNote(scene.id, config.department, content).then(() => router.refresh())}
                    />
                  </div>
                ) : note?.content ? (
                  <p className="text-body-sm text-ash mt-2 italic border-l-2 border-bone pl-3">{note.content}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ======================== REFERENCES ======================== */}
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
              <h3 className="text-body-md font-medium text-ink">Upload Reference</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Title</label>
                  <input value={refTitle} onChange={(e) => setRefTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Category</label>
                  <select value={refCategory} onChange={(e) => setRefCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
                    {config.referenceCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">File (image or document)</label>
                <input ref={refImageRef} type="file"
                  accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.dwg,.vwx,.pptx,.zip"
                  className="text-body-sm text-ash file:mr-3 file:px-3 file:py-1.5 file:bg-bone/50 file:border-0 file:rounded-card file:text-body-xs file:text-ink file:cursor-pointer" />
                <p className="text-body-xs text-muted mt-1">Plots, patch lists, drawings, paperwork. 10MB max.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddRef} disabled={saving || !refTitle.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Uploading..." : "Upload"}
                </button>
                <button onClick={() => setShowRefForm(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink">Cancel</button>
              </div>
            </div>
          )}
          {references.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
              <p className="text-body-md text-ash">No references uploaded yet.</p>
              <p className="text-body-xs text-muted mt-1">Plots, inspiration, mood boards, technical drawings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {references.map((ref) => {
                const isImage = ref.mime_type
                  ? ref.mime_type.startsWith("image/")
                  : !/\.(pdf|xlsx|xls|csv|docx|doc|txt|dwg|vwx|pptx|zip)(\?|$)/i.test(ref.image_url);
                return (
                <div key={ref.id} className="bg-card border border-bone rounded-card overflow-hidden">
                  {isImage ? (
                    <img src={ref.image_url} alt={ref.title} onClick={() => setLightbox(ref.image_url)}
                      className="w-full aspect-[4/3] object-cover cursor-pointer" />
                  ) : (
                    <a href={ref.image_url} target="_blank" rel="noreferrer"
                      className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-2 bg-bone/30 hover:bg-bone/50 transition-colors">
                      <span className="text-3xl" aria-hidden>📄</span>
                      <span className="text-body-xs text-ash px-3 text-center truncate max-w-full">
                        {ref.file_name || "Open document"}
                      </span>
                      <span className="text-body-xs text-brick">Open</span>
                    </a>
                  )}
                  <div className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-body-sm font-medium text-ink truncate">{ref.title}</h4>
                      {canManage && (
                        <button onClick={async () => { if (confirm("Delete?")) { await deleteDesignReference(ref.id); router.refresh(); } }}
                          className="text-muted hover:text-brick text-body-xs ml-2 shrink-0">×</button>
                      )}
                    </div>
                    <span className="text-body-xs text-muted">{config.referenceCategories.find(c => c.value === ref.category)?.label || ref.category}</span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================== PROGRESS ======================== */}
      {view === "progress" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-body-xs text-muted uppercase tracking-wider mb-3">Design milestones</h3>
            {milestones.length === 0 ? (
              <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
                <p className="text-body-sm text-muted mb-3">No milestones yet.</p>
                {canManage && (
                  <button onClick={async () => { setSaving(true); await seedMilestones(productionId, config.department); setSaving(false); router.refresh(); }}
                    disabled={saving}
                    className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                    {saving ? "Setting up..." : `Set up ${config.departmentLabel.toLowerCase()} milestones`}
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-card border border-bone rounded-card divide-y divide-bone">
                {milestones.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-bone/20 transition-colors">
                    <input type="checkbox" checked={m.completed}
                      onChange={() => toggleMilestone(m.id, !m.completed).then(() => router.refresh())}
                      disabled={!canManage}
                      className="w-4 h-4 rounded border-bone text-confirmed focus:ring-confirmed" />
                    <span className={`text-body-sm flex-1 ${m.completed ? "text-muted line-through" : "text-ink"}`}>{m.milestone}</span>
                    {m.completed && m.completed_at && (
                      <span className="text-body-xs text-muted font-mono">
                        {new Date(m.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{activeCues.length}</p>
              <p className="text-body-xs text-muted">{config.cueLabelPlural}</p>
            </div>
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{activeElements.length}</p>
              <p className="text-body-xs text-muted">{config.elementLabelPlural}</p>
            </div>
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{references.length}</p>
              <p className="text-body-xs text-muted">References</p>
            </div>
          </div>

          {/* Guidance */}
          <div className="bg-bone/20 border border-bone rounded-card px-5 py-4">
            <h3 className="text-body-sm font-medium text-ink mb-2">Where to Start</h3>
            <div className="space-y-2 text-body-sm text-ash">
              {config.guidance.map((step, i) => <p key={i} dangerouslySetInnerHTML={{ __html: step }} />)}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-paper/70 hover:text-paper text-2xl">✕</button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-card" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// Inline editable note
function EditableNote({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  function handleSave() {
    if (text.trim() !== value) onSave(text.trim());
    setEditing(false);
  }

  if (!editing) {
    return (
      <div onClick={() => { setEditing(true); setText(value); }} className="cursor-pointer">
        {value ? (
          <p className="text-body-sm text-ash italic border-l-2 border-brick/30 pl-3">{value}</p>
        ) : (
          <p className="text-body-xs text-muted italic hover:text-ash transition-colors">+ Add design notes...</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); } if (e.key === "Escape") { setEditing(false); setText(value); } }}
        autoFocus rows={3} placeholder={placeholder}
        className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none" />
      <div className="flex gap-2 mt-1">
        <button onClick={handleSave} className="text-body-xs font-medium text-brick">Save</button>
        <button onClick={() => { setEditing(false); setText(value); }} className="text-body-xs text-muted">Cancel</button>
      </div>
    </div>
  );
}
