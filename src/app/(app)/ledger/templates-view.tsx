"use client";

import { useState } from "react";
import { updateTemplate, createTemplate, deleteTemplate } from "./ledger-actions";
import { useRouter } from "next/navigation";
import { renderRichText } from "@/lib/rich-text";

interface Template {
  id: string;
  contract_type: string;
  title: string;
  body_markdown: string;
}

interface Props {
  templates: Template[];
  productionId: string;
  contractCounts: Record<string, number>;
  systemTemplates: Template[];
}

const TYPE_LABELS: Record<string, string> = {
  actor: "Actor",
  band: "Band",
  crew: "Crew",
  director: "Director",
  lighting_design: "Lighting Design",
  original_music: "Original Music",
  props_asm: "Props / ASM",
  set_design: "Set Design",
  sound_design: "Sound Design",
  sound_engineer: "Sound Engineer",
  stage_manager: "Stage Manager",
};

function typeLabel(type: string) {
  return TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TemplatesView({ templates, productionId, contractCounts, systemTemplates }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const router = useRouter();

  const selected = templates.find((t) => t.id === selectedId);
  const sorted = [...templates].sort((a, b) => a.title.localeCompare(b.title));

  function openTemplate(t: Template) {
    setSelectedId(t.id);
    setEditing(false);
    setEditTitle(t.title);
    setEditBody(t.body_markdown);
  }

  function startEdit() {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditBody(selected.body_markdown);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("id", selected.id);
    fd.set("title", editTitle);
    fd.set("body_markdown", editBody);
    const result = await updateTemplate(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setEditing(false);
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    const count = contractCounts[id] || 0;
    if (count > 0) {
      alert(`Cannot delete — ${count} contract(s) use this template.`);
      return;
    }
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setSaving(true);
    const result = await deleteTemplate(id);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setSelectedId(null);
      router.refresh();
    }
  }

  async function handleCreate() {
    if (!newType || !newTitle.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("contract_type", newType);
    fd.set("title", newTitle.trim());
    fd.set("body_markdown", `# ${newTitle.trim()}\n\n**Production:** {{production_title}}\n**Organization:** {{organization_name}}\n**Name:** {{performer_name}}\n**Role:** {{role_title}}\n\n---\n\n**Compensation:** {{compensation}}\n**Period:** {{start_date}} – {{end_date}}\n\nContract terms go here.\n\n---\n\n**By signing below, both parties agree to the terms outlined above.**`);
    const result = await createTemplate(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setShowCreate(false);
      setNewType("");
      setNewTitle("");
      router.refresh();
    }
  }

  async function forkSystemTemplate(sys: Template) {
    setSaving(true);
    const fd = new FormData();
    fd.set("production_id", productionId);
    fd.set("contract_type", sys.contract_type);
    fd.set("title", sys.title);
    fd.set("body_markdown", sys.body_markdown);
    const result = await createTemplate(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else router.refresh();
  }

  // Detail / edit view
  if (selected) {
    const count = contractCounts[selected.id] || 0;

    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          className="text-body-sm text-ash hover:text-ink mb-4 transition-colors"
        >
          ← Back to templates
        </button>

        <div className="bg-card border border-bone rounded-card overflow-hidden">
          <div className="px-6 py-4 border-b border-bone">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                {editing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-display text-display-sm text-ink bg-transparent border-b border-brick focus:outline-none w-full"
                  />
                ) : (
                  <h2 className="font-display text-display-sm text-ink">{selected.title}</h2>
                )}
                <p className="text-body-sm text-ash mt-0.5">
                  {typeLabel(selected.contract_type)} · {count} active contract{count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!editing && (
                  <>
                    <button
                      onClick={startEdit}
                      className="text-body-sm text-brick hover:text-brick/80 font-medium transition-colors"
                    >
                      Edit
                    </button>
                    {count === 0 && (
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className="text-body-xs text-muted hover:text-conflict transition-colors"
                        title="Delete template"
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-body-xs text-muted uppercase tracking-wider block mb-1">
                    Template Body (Markdown)
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={24}
                    className="w-full px-3 py-2 bg-paper border border-bone rounded text-body-sm text-ink font-mono leading-relaxed focus:border-brick focus:outline-none resize-y"
                    placeholder="Contract body markdown..."
                  />
                </div>

                <div className="bg-paper border border-bone rounded-card px-4 py-3">
                  <p className="text-body-xs text-muted font-medium mb-1 uppercase tracking-wider">Available placeholders</p>
                  <p className="text-body-xs text-ash font-mono">
                    {"{{performer_name}}"} · {"{{role_title}}"} · {"{{compensation}}"} · {"{{production_title}}"} · {"{{organization_name}}"} · {"{{start_date}}"} · {"{{end_date}}"} · {"{{performance_dates}}"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-brick text-paper font-medium rounded-card text-body-sm hover:bg-brick/90 disabled:opacity-40 transition-colors"
                  >
                    {saving ? "Saving…" : "Save Template"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose-contract space-y-3">
                {renderRichText(selected.body_markdown)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-body-sm text-ash">
          {templates.length} template{templates.length !== 1 ? "s" : ""} for this production
        </p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-body-sm text-brick hover:text-brick/80 font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ New template"}
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-brick/20 rounded-card px-4 py-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-body-xs text-muted uppercase tracking-wider block mb-1">Contract type</label>
              <input
                type="text"
                value={newType}
                onChange={(e) => setNewType(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                placeholder="e.g. costume_designer"
                className="w-full px-3 py-2 bg-paper border border-bone rounded text-body-sm text-ink font-mono focus:border-brick focus:outline-none"
              />
            </div>
            <div>
              <label className="text-body-xs text-muted uppercase tracking-wider block mb-1">Display title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Costume Designer Agreement"
                className="w-full px-3 py-2 bg-paper border border-bone rounded text-body-sm text-ink focus:border-brick focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newType || !newTitle.trim() || saving}
            className="px-4 py-2 bg-brick text-paper font-medium rounded-card text-body-sm hover:bg-brick/90 disabled:opacity-40 transition-colors"
          >
            {saving ? "Creating…" : "Create Template"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((t) => {
          const count = contractCounts[t.id] || 0;
          return (
            <button
              key={t.id}
              onClick={() => openTemplate(t)}
              className="w-full bg-card border border-bone rounded-card px-4 py-3 flex items-center justify-between gap-3 hover:border-ash transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-body-md text-ink font-medium truncate">{t.title}</p>
                <p className="text-body-sm text-ash truncate">
                  {typeLabel(t.contract_type)} · {count} contract{count !== 1 ? "s" : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {templates.length === 0 && (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">No templates found for this production.</p>
        </div>
      )}

      {/* System templates — available to fork */}
      {systemTemplates.length > 0 && (
        <div className="mt-8">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-3">
            System templates
          </p>
          <p className="text-body-sm text-ash mb-4">
            Starter templates you can add to this production and customize.
          </p>
          <div className="space-y-2">
            {systemTemplates
              .filter((sys) => !templates.some((t) => t.contract_type === sys.contract_type))
              .map((sys) => (
                <div
                  key={sys.id}
                  className="bg-card border border-bone/60 border-dashed rounded-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-body-md text-ash">{sys.title}</p>
                    <p className="text-body-xs text-muted">{typeLabel(sys.contract_type)}</p>
                  </div>
                  <button
                    onClick={() => forkSystemTemplate(sys)}
                    disabled={saving}
                    className="text-body-sm text-brick hover:text-brick/80 font-medium transition-colors shrink-0 disabled:opacity-40"
                  >
                    + Add
                  </button>
                </div>
              ))}
          </div>
          {systemTemplates.filter((sys) => !templates.some((t) => t.contract_type === sys.contract_type)).length === 0 && (
            <p className="text-body-sm text-muted">All system templates are already in use.</p>
          )}
        </div>
      )}
    </div>
  );
}
