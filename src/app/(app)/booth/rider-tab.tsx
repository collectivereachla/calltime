"use client";

import { useState, useTransition } from "react";
import { addRiderSection, updateRiderSection, deleteRiderSection, moveRiderSection } from "./rider-actions";
import { AUTO_SOURCE_LABELS, type RiderAutoSource } from "./rider-data";

interface RiderSection {
  id: string;
  sort_order: number;
  title: string;
  kind: "custom" | "auto";
  source: RiderAutoSource | null;
  body: string | null;
}

interface Props {
  productionId: string;
  productionTitle: string;
  sections: RiderSection[];
  autoBodies: Record<RiderAutoSource, string>;
  canManage: boolean;
}

export function RiderTab({ productionId, productionTitle, sections, autoBodies, canManage }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string } | { success: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) setError(res.error);
      else {
        setEditing(null);
        setAdding(false);
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-h3 font-display">Technical Rider</h2>
          <p className="text-body-sm text-ash">
            Sections marked <span className="font-medium text-ink">live</span> render from production data and stay current on their own.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              onClick={() => { setAdding(true); setEditing(null); }}
              className="px-3 py-1.5 text-body-sm border border-bone rounded-card text-ink hover:bg-bone/40"
            >
              Add section
            </button>
          )}
          <a
            href={`/rider-print?p=${productionId}`}
            target="_blank"
            className="px-3 py-1.5 text-body-sm bg-ink text-paper rounded-card hover:bg-ink/90"
          >
            Print rider
          </a>
        </div>
      </div>

      {error && <p className="text-body-sm text-brick mb-3">{error}</p>}

      {adding && canManage && (
        <SectionForm
          heading="New section"
          onCancel={() => setAdding(false)}
          onSave={(title, body, kind, source) =>
            run(() => addRiderSection({ production_id: productionId, title, kind, source, body }))
          }
          allowKindChoice
          pending={pending}
        />
      )}

      {sections.length === 0 && !adding && (
        <p className="text-body-sm text-ash border border-dashed border-bone rounded-card p-6 text-center">
          No rider yet for {productionTitle}.{canManage ? " Add a section to start one." : ""}
        </p>
      )}

      <div className="space-y-3">
        {sections.map((s, i) => (
          <div key={s.id} className="border border-bone rounded-card bg-card">
            {editing === s.id && s.kind === "custom" ? (
              <div className="p-4">
                <SectionForm
                  heading="Edit section"
                  initialTitle={s.title}
                  initialBody={s.body || ""}
                  onCancel={() => setEditing(null)}
                  onSave={(title, body) => run(() => updateRiderSection({ id: s.id, title, body }))}
                  pending={pending}
                />
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-body font-semibold tracking-wide">
                    {s.title}
                    {s.kind === "auto" && (
                      <span className="ml-2 text-body-xs font-normal text-brick border border-brick/40 rounded px-1.5 py-0.5">
                        live · {s.source ? AUTO_SOURCE_LABELS[s.source] : ""}
                      </span>
                    )}
                  </h3>
                  {canManage && (
                    <div className="flex gap-1 text-body-xs shrink-0">
                      <button disabled={pending || i === 0} onClick={() => run(() => moveRiderSection({ production_id: productionId, id: s.id, direction: "up" }))} className="px-2 py-1 text-ash hover:text-ink disabled:opacity-30">↑</button>
                      <button disabled={pending || i === sections.length - 1} onClick={() => run(() => moveRiderSection({ production_id: productionId, id: s.id, direction: "down" }))} className="px-2 py-1 text-ash hover:text-ink disabled:opacity-30">↓</button>
                      {s.kind === "custom" && (
                        <button disabled={pending} onClick={() => { setEditing(s.id); setAdding(false); }} className="px-2 py-1 text-ash hover:text-ink">Edit</button>
                      )}
                      <button
                        disabled={pending}
                        onClick={() => { if (confirm(`Delete "${s.title}" from the rider?`)) run(() => deleteRiderSection(s.id)); }}
                        className="px-2 py-1 text-ash hover:text-brick"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-body-sm text-ink/90">
                  {s.kind === "auto" && s.source ? autoBodies[s.source] : s.body}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionForm({
  heading,
  initialTitle = "",
  initialBody = "",
  onSave,
  onCancel,
  allowKindChoice = false,
  pending,
}: {
  heading: string;
  initialTitle?: string;
  initialBody?: string;
  onSave: (title: string, body: string, kind: "custom" | "auto", source: RiderAutoSource | null) => void;
  onCancel: () => void;
  allowKindChoice?: boolean;
  pending: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [kind, setKind] = useState<"custom" | "auto">("custom");
  const [source, setSource] = useState<RiderAutoSource>("contacts");

  return (
    <div className="border border-bone rounded-card p-4 mb-4 bg-card">
      <p className="text-body-sm font-semibold mb-2">{heading}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Section title (e.g. LIGHTING)"
        className="w-full border border-bone rounded-card px-3 py-2 text-body-sm mb-2 bg-paper"
      />
      {allowKindChoice && (
        <div className="flex gap-3 items-center mb-2 text-body-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={kind === "custom"} onChange={() => setKind("custom")} /> Written section
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={kind === "auto"} onChange={() => setKind("auto")} /> Live data section
          </label>
          {kind === "auto" && (
            <select value={source} onChange={(e) => setSource(e.target.value as RiderAutoSource)} className="border border-bone rounded-card px-2 py-1 bg-paper">
              {(Object.keys(AUTO_SOURCE_LABELS) as RiderAutoSource[]).map((k) => (
                <option key={k} value={k}>{AUTO_SOURCE_LABELS[k]}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {kind === "custom" && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Section text, exactly as it should print."
          className="w-full border border-bone rounded-card px-3 py-2 text-body-sm font-mono mb-2 bg-paper"
        />
      )}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => onSave(title, body, kind, kind === "auto" ? source : null)}
          className="px-3 py-1.5 text-body-sm bg-ink text-paper rounded-card disabled:opacity-50"
        >
          Save
        </button>
        <button disabled={pending} onClick={onCancel} className="px-3 py-1.5 text-body-sm text-ash hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
