"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  saveDesignElement, deleteDesignElement, uploadDesignImage,
  saveDesignReference, deleteDesignReference,
  saveSceneDesignNote, toggleMilestone,
} from "./set-design-actions";
import { StageViewer } from "./stage-viewer";

interface Scene {
  id: string;
  act: number;
  scene_number: number;
  title: string | null;
  location: string | null;
}

interface Element {
  id: string;
  name: string;
  description: string | null;
  status: string;
  image_url: string | null;
  notes: string | null;
  scene_ids: string[];
  pos_x: number;
  pos_y: number;
  width_ft: number;
  depth_ft: number;
  height_ft: number;
  rotation: number;
  color: string;
}

interface Reference {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string;
  created_at: string;
}

interface Milestone {
  id: string;
  milestone: string;
  sort_order: number;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

interface StageConfig {
  stage_width: number;
  stage_depth: number;
  proscenium_width: number;
  proscenium_height: number;
  grid_size: number;
}

interface Props {
  productionId: string;
  scenes: Scene[];
  elements: Element[];
  references: Reference[];
  milestones: Milestone[];
  sceneNotes: { scene_id: string; content: string | null }[];
  stageConfig: StageConfig | null;
  canManage: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  concept: { label: "Concept", color: "bg-ash/10 text-ash" },
  designed: { label: "Designed", color: "bg-tentative/10 text-tentative" },
  in_build: { label: "In Build", color: "bg-brick/10 text-brick" },
  complete: { label: "Complete", color: "bg-confirmed/10 text-confirmed" },
  cut: { label: "Cut", color: "bg-muted/20 text-muted line-through" },
};

const REF_CATEGORIES = [
  { value: "ground_plan", label: "Ground Plan" },
  { value: "rendering", label: "Rendering" },
  { value: "elevation", label: "Elevation" },
  { value: "reference", label: "Reference" },
  { value: "mood_board", label: "Mood Board" },
  { value: "photo", label: "Photo" },
  { value: "technical", label: "Technical" },
];

function sceneLabel(s: Scene): string {
  return `${s.act === 1 ? "I" : "II"}.${s.scene_number}`;
}

export function SetDesign({ productionId, scenes, elements, references, milestones, sceneNotes, stageConfig, canManage }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"progress" | "stage" | "pieces" | "scenes" | "references">("progress");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddRef, setShowAddRef] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const refImageRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStatus, setFormStatus] = useState("concept");
  const [formNotes, setFormNotes] = useState("");
  const [formScenes, setFormScenes] = useState<Set<string>>(new Set());
  const [refTitle, setRefTitle] = useState("");
  const [refDesc, setRefDesc] = useState("");
  const [refCategory, setRefCategory] = useState("reference");

  function openEdit(el: Element) {
    setEditingId(el.id);
    setFormName(el.name);
    setFormDesc(el.description || "");
    setFormStatus(el.status);
    setFormNotes(el.notes || "");
    setFormScenes(new Set(el.scene_ids));
    setShowAdd(true);
  }

  function openAdd() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormStatus("concept");
    setFormNotes("");
    setFormScenes(new Set());
    setShowAdd(true);
  }

  function toggleScene(id: string) {
    setFormScenes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);
    const result = await saveDesignElement({
      id: editingId || undefined,
      production_id: productionId,
      department: "set",
      name: formName.trim(),
      description: formDesc.trim() || null,
      status: formStatus,
      notes: formNotes.trim() || null,
      scene_ids: Array.from(formScenes),
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setShowAdd(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this set piece?")) return;
    await deleteDesignElement(id);
    router.refresh();
  }

  async function handleImageUpload(elementId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("image", file);
    const result = await uploadDesignImage(elementId, fd);
    setSaving(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function handleAddReference() {
    if (!refTitle.trim() || !refImageRef.current?.files?.[0]) return;
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("image", refImageRef.current.files[0]);
    const result = await saveDesignReference({
      production_id: productionId,
      department: "set",
      title: refTitle.trim(),
      description: refDesc.trim() || null,
      category: refCategory,
      formData: fd,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setShowAddRef(false);
    setRefTitle("");
    setRefDesc("");
    setRefCategory("reference");
    router.refresh();
  }

  async function handleDeleteRef(id: string) {
    if (!confirm("Delete this reference?")) return;
    await deleteDesignReference(id);
    router.refresh();
  }

  // Scene breakdown: group elements by scene
  const sceneBreakdown = scenes.map((s) => ({
    scene: s,
    pieces: elements.filter((el) => el.scene_ids.includes(s.id) && el.status !== "cut"),
  }));

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex gap-1 mb-6">
        {(["progress", "stage", "pieces", "scenes", "references"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-body-xs font-medium rounded-full transition-colors ${
              view === v ? "bg-ink/10 text-ink" : "text-ash hover:text-ink"
            }`}
          >
            {v === "progress" ? `Progress (${milestones.filter((m) => m.completed).length}/${milestones.length})` :
             v === "stage" ? "Stage" :
             v === "pieces" ? `Set Pieces (${elements.filter((e) => e.status !== "cut").length})` :
             v === "scenes" ? "Scene Breakdown" : `References (${references.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-body-xs text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-2 mb-4">{error}</div>
      )}

      {/* PROGRESS VIEW */}
      {view === "progress" && (
        <div className="space-y-6">
          {/* Milestones checklist */}
          <div>
            <h3 className="text-body-xs text-muted uppercase tracking-wider mb-3">Design milestones</h3>
            {milestones.length === 0 ? (
              <p className="text-body-sm text-muted italic">No milestones set up yet.</p>
            ) : (
              <div className="bg-card border border-bone rounded-card divide-y divide-bone">
                {milestones.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-bone/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={m.completed}
                      onChange={() => toggleMilestone(m.id, !m.completed).then(() => router.refresh())}
                      disabled={!canManage}
                      className="w-4 h-4 rounded border-bone text-confirmed focus:ring-confirmed"
                    />
                    <span className={`text-body-sm flex-1 ${m.completed ? "text-muted line-through" : "text-ink"}`}>
                      {m.milestone}
                    </span>
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

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{elements.filter((e) => e.status !== "cut").length}</p>
              <p className="text-body-xs text-muted">Set pieces</p>
            </div>
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{elements.filter((e) => e.status === "complete").length}</p>
              <p className="text-body-xs text-muted">Complete</p>
            </div>
            <div className="bg-card border border-bone rounded-card px-4 py-3 text-center">
              <p className="font-mono text-data-md text-ink">{references.length}</p>
              <p className="text-body-xs text-muted">References</p>
            </div>
          </div>

          {/* Guidance for less experienced designers */}
          <div className="bg-bone/20 border border-bone rounded-card px-5 py-4">
            <h3 className="text-body-sm font-medium text-ink mb-2">Where to Start</h3>
            <div className="space-y-2 text-body-sm text-ash">
              <p>Start with the <strong className="text-ink">Scene Breakdown</strong> tab. Read each scene's location and write what the audience needs to see — what tells the story of this place?</p>
              <p>From those notes, identify the <strong className="text-ink">Set Pieces</strong> you need to build or source. A "cabin" might be a door frame + window flat + porch railing — break it into buildable parts.</p>
              <p>Upload <strong className="text-ink">References</strong> — photos, sketches, mood boards — anything that helps communicate the vision. A good reference image is worth a thousand words in a design meeting.</p>
              <p>The ground plan comes from your venue's technical specs. If you have one, upload it as a Reference with the "Ground Plan" category.</p>
            </div>
          </div>
        </div>
      )}

      {/* STAGE VIEW */}
      {view === "stage" && stageConfig && (
        <StageViewer
          pieces={elements.map((e) => ({
            id: e.id, name: e.name, pos_x: e.pos_x, pos_y: e.pos_y,
            width_ft: e.width_ft, depth_ft: e.depth_ft, height_ft: e.height_ft,
            rotation: e.rotation, color: e.color, status: e.status,
          }))}
          config={stageConfig}
          canManage={canManage}
          onRefresh={() => router.refresh()}
        />
      )}

      {view === "stage" && !stageConfig && (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No stage configuration set up yet.</p>
        </div>
      )}

      {/* SET PIECES VIEW */}
      {view === "pieces" && (
        <div>
          {canManage && !showAdd && (
            <button
              onClick={openAdd}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4"
            >
              + Add set piece
            </button>
          )}

          {/* Add/Edit form */}
          {showAdd && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">{editingId ? "Edit" : "New"} set piece</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Porch railing, Tree flat"
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Status</label>
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
                    {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Description</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="Materials, dimensions, paint treatment..."
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none" />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Scenes</label>
                <div className="flex flex-wrap gap-1.5">
                  {scenes.map((s) => (
                    <button key={s.id} onClick={() => toggleScene(s.id)}
                      className={`px-2 py-1 text-body-xs rounded-full border transition-colors ${
                        formScenes.has(s.id) ? "bg-ink text-paper border-ink" : "border-bone text-ash hover:border-ash"
                      }`}>
                      {sceneLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Notes</label>
                <input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Build notes, storage, special handling..."
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving || !formName.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editingId ? "Update" : "Add piece"}
                </button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Pieces list */}
          {elements.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
              <p className="text-body-md text-ash">No set pieces added yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map((el) => {
                const s = STATUS_LABELS[el.status] || STATUS_LABELS.concept;
                const elScenes = scenes.filter((sc) => el.scene_ids.includes(sc.id));
                return (
                  <div key={el.id} className="bg-card border border-bone rounded-card px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 min-w-0">
                        {el.image_url ? (
                          <img src={el.image_url} alt="" onClick={() => setLightbox(el.image_url)}
                            className="w-16 h-16 rounded-card object-cover shrink-0 cursor-pointer border border-bone" />
                        ) : canManage ? (
                          <label className="w-16 h-16 rounded-card border border-dashed border-bone flex items-center justify-center text-muted text-body-xs cursor-pointer hover:border-ash shrink-0">
                            + img
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => handleImageUpload(el.id, e)} />
                          </label>
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-body-md font-medium text-ink">{el.name}</h3>
                            <span className={`text-body-xs px-1.5 py-0.5 rounded ${s.color}`}>{s.label}</span>
                          </div>
                          {el.description && <p className="text-body-sm text-ash">{el.description}</p>}
                          {elScenes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {elScenes.map((sc) => (
                                <span key={sc.id} className="font-mono text-[10px] px-1.5 py-0.5 bg-bone/50 text-ash rounded">
                                  {sceneLabel(sc)}
                                </span>
                              ))}
                            </div>
                          )}
                          {el.notes && <p className="text-body-xs text-muted mt-1 italic">{el.notes}</p>}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => openEdit(el)} className="text-body-xs text-ash hover:text-ink transition-colors">Edit</button>
                          <button onClick={() => handleDelete(el.id)} className="text-body-xs text-muted hover:text-brick transition-colors">×</button>
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

      {/* SCENE BREAKDOWN VIEW */}
      {view === "scenes" && (
        <div className="space-y-3">
          <p className="text-body-xs text-muted mb-2">
            Each scene's location comes from the script. Use the notes field to describe what the set should look like — what does the audience see? What tells the story of this place?
          </p>
          {sceneBreakdown.map(({ scene, pieces }) => {
            const note = sceneNotes.find((n) => n.scene_id === scene.id);
            return (
              <div key={scene.id} className="bg-card border border-bone rounded-card px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-data-sm text-ink font-semibold">{sceneLabel(scene)}</span>
                  {scene.title && <span className="text-body-sm text-ash">{scene.title}</span>}
                  <span className="text-body-xs text-muted ml-auto">{pieces.length} piece{pieces.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Location from script */}
                {scene.location && (
                  <p className="text-body-sm text-ink mt-1">
                    <span className="text-muted">Location:</span> <span className="font-medium">{scene.location}</span>
                  </p>
                )}

                {/* Set pieces assigned */}
                {pieces.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pieces.map((p) => (
                      <span key={p.id} className={`text-body-xs px-2 py-0.5 rounded-full border ${
                        p.status === "complete" ? "border-confirmed/30 text-confirmed" :
                        p.status === "in_build" ? "border-brick/30 text-brick" :
                        "border-bone text-ash"
                      }`}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Design notes — editable by staff */}
                {canManage ? (
                  <div className="mt-3">
                    <EditableNote
                      value={note?.content || ""}
                      placeholder={scene.location
                        ? `What does "${scene.location}" look like on stage? What set pieces are needed?`
                        : "Describe the set for this scene..."}
                      onSave={(content) => saveSceneDesignNote(scene.id, "set", content).then(() => router.refresh())}
                    />
                  </div>
                ) : note?.content ? (
                  <p className="text-body-sm text-ash mt-2 italic border-l-2 border-bone pl-3">{note.content}</p>
                ) : null}

                {/* Prompt if no pieces and no notes */}
                {pieces.length === 0 && !note?.content && (
                  <p className="text-body-xs text-tentative mt-2">
                    ⚠ No set pieces or design notes yet for this scene.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* REFERENCES VIEW */}
      {view === "references" && (
        <div>
          {canManage && !showAddRef && (
            <button onClick={() => setShowAddRef(true)}
              className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors mb-4">
              + Upload reference
            </button>
          )}

          {showAddRef && (
            <div className="bg-card border border-bone rounded-card p-5 mb-4 space-y-3">
              <h3 className="text-body-md font-medium text-ink">Upload Reference</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Title</label>
                  <input value={refTitle} onChange={(e) => setRefTitle(e.target.value)} placeholder="e.g. Ground plan v2"
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Category</label>
                  <select value={refCategory} onChange={(e) => setRefCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none">
                    {REF_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Description (optional)</label>
                <input value={refDesc} onChange={(e) => setRefDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none" />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Image</label>
                <input ref={refImageRef} type="file" accept="image/*,.pdf"
                  className="text-body-sm text-ash file:mr-3 file:px-3 file:py-1.5 file:bg-bone/50 file:border-0 file:rounded-card file:text-body-xs file:text-ink file:cursor-pointer" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddReference} disabled={saving || !refTitle.trim()}
                  className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {saving ? "Uploading..." : "Upload"}
                </button>
                <button onClick={() => setShowAddRef(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {references.length === 0 ? (
            <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
              <p className="text-body-md text-ash">No references uploaded yet.</p>
              <p className="text-body-xs text-muted mt-1">Ground plans, renderings, mood boards, research photos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {references.map((ref) => (
                <div key={ref.id} className="bg-card border border-bone rounded-card overflow-hidden">
                  <img src={ref.image_url} alt={ref.title}
                    onClick={() => setLightbox(ref.image_url)}
                    className="w-full aspect-[4/3] object-cover cursor-pointer" />
                  <div className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-body-sm font-medium text-ink truncate">{ref.title}</h4>
                      {canManage && (
                        <button onClick={() => handleDeleteRef(ref.id)} className="text-muted hover:text-brick text-body-xs ml-2 shrink-0">×</button>
                      )}
                    </div>
                    <span className="text-body-xs text-muted">{REF_CATEGORIES.find((c) => c.value === ref.category)?.label || ref.category}</span>
                    {ref.description && <p className="text-body-xs text-ash mt-0.5">{ref.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
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

// Inline editable note with save on blur/enter
function EditableNote({ value, placeholder, onSave }: {
  value: string;
  placeholder: string;
  onSave: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    if (text.trim() !== value) {
      setSaving(true);
      onSave(text.trim());
      setSaving(false);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => { setEditing(true); setText(value); }}
        className="cursor-pointer"
      >
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
          if (e.key === "Escape") { setEditing(false); setText(value); }
        }}
        autoFocus
        rows={3}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none"
      />
      <div className="flex gap-2 mt-1">
        <button onClick={handleSave} disabled={saving} className="text-body-xs font-medium text-brick">{saving ? "Saving..." : "Save"}</button>
        <button onClick={() => { setEditing(false); setText(value); }} className="text-body-xs text-muted">Cancel</button>
      </div>
    </div>
  );
}
