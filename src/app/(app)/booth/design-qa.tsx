"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDesignQuestion,
  addDesignReply,
  setDesignQuestionStatus,
  deleteDesignQuestion,
  deleteDesignReply,
} from "./design-qa-actions";

interface Person { id: string; full_name: string | null; preferred_name: string | null; }
interface Scene { id: string; act: number; scene_number: number; title: string | null; }
export interface DesignQuestion {
  id: string;
  scene_id: string | null;
  script_line_id: string | null;
  department: string | null;
  author_person_id: string;
  body: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
  author: Person | null;
}
export interface DesignReply {
  id: string;
  question_id: string;
  author_person_id: string;
  body: string;
  created_at: string;
  author: Person | null;
}

interface Props {
  productionId: string;
  viewerPersonId: string;
  canResolve: boolean;
  scenes: Scene[];
  questions: DesignQuestion[];
  replies: DesignReply[];
}

const DEPARTMENTS: [string, string][] = [
  ["costume", "Costume"], ["props", "Props"], ["set", "Set"],
  ["lights", "Lights"], ["sound", "Sound"], ["video", "Video"],
];
const DEPT_LABEL = Object.fromEntries(DEPARTMENTS);

const STATUS_BADGE: Record<string, string> = {
  open: "bg-brick/10 text-brick",
  answered: "bg-tentative/10 text-tentative",
  resolved: "bg-confirmed/10 text-confirmed",
};

function personName(p: Person | null) {
  return p?.preferred_name || p?.full_name || "Someone";
}
function shortScene(s: Scene | undefined) {
  if (!s) return "";
  return `A${s.act} Sc ${s.scene_number}`;
}
function timeAgo(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DesignQA({ productionId, viewerPersonId, canResolve, scenes, questions, replies }: Props) {
  const router = useRouter();
  const [fStatus, setFStatus] = useState<"all" | "open" | "answered" | "resolved">("open");
  const [fScene, setFScene] = useState<string>("all");
  const [fDept, setFDept] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [body, setBody] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [dept, setDept] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const sceneById = useMemo(() => {
    const m = new Map<string, Scene>();
    scenes.forEach((s) => m.set(s.id, s));
    return m;
  }, [scenes]);

  const repliesByQ = useMemo(() => {
    const m = new Map<string, DesignReply[]>();
    for (const r of replies) {
      const arr = m.get(r.question_id) || [];
      arr.push(r);
      m.set(r.question_id, arr);
    }
    return m;
  }, [replies]);

  const openCount = useMemo(() => questions.filter((q) => q.status === "open").length, [questions]);

  const filtered = useMemo(
    () =>
      questions.filter(
        (q) =>
          (fStatus === "all" || q.status === fStatus) &&
          (fScene === "all" || q.scene_id === fScene) &&
          (fDept === "all" || q.department === fDept)
      ),
    [questions, fStatus, fScene, fDept]
  );

  async function submitQuestion() {
    if (!body.trim()) return;
    setBusy(true);
    await createDesignQuestion({
      production_id: productionId,
      scene_id: sceneId || null,
      department: dept || null,
      body: body.trim(),
    });
    setBusy(false);
    setBody(""); setSceneId(""); setDept(""); setShowForm(false);
    router.refresh();
  }

  async function submitReply(qid: string) {
    const text = (drafts[qid] || "").trim();
    if (!text) return;
    setBusy(true);
    await addDesignReply({ question_id: qid, body: text });
    setBusy(false);
    setDrafts((d) => ({ ...d, [qid]: "" }));
    router.refresh();
  }

  async function changeStatus(id: string, status: "open" | "answered" | "resolved") {
    setBusy(true);
    await setDesignQuestionStatus(id, status);
    setBusy(false);
    router.refresh();
  }

  async function removeQuestion(id: string) {
    setBusy(true);
    await deleteDesignQuestion(id);
    setBusy(false);
    router.refresh();
  }

  async function removeReply(id: string) {
    setBusy(true);
    await deleteDesignReply(id);
    setBusy(false);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const selectCls = "px-2 py-1 bg-paper border border-bone rounded-card text-body-xs text-ink focus:border-brick focus:outline-none";

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-body-sm text-ash">
            Questions and comments for the design and production team. The Stage Manager and Director are notified of every new item.
          </p>
          {openCount > 0 && (
            <p className="text-body-xs text-brick font-medium mt-1">{openCount} open</p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors"
        >
          {showForm ? "Close" : "Ask / comment"}
        </button>
      </div>

      {showForm && (
        <div className="mb-5 bg-card border border-brick/40 rounded-card p-3 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Your question or comment..."
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
          />
          <div className="flex flex-wrap gap-2">
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className={selectCls}>
              <option value="">No scene</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {shortScene(s)}{s.title ? `: ${s.title}` : ""}
                </option>
              ))}
            </select>
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls}>
              <option value="">No department</option>
              {DEPARTMENTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              disabled={busy || !body.trim()}
              onClick={submitQuestion}
              className="px-4 py-1.5 bg-brick text-paper text-body-xs font-medium rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-card border border-bone rounded-full p-0.5">
          {(["open", "answered", "resolved", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFStatus(s)}
              className={`px-3 py-1 text-body-xs font-medium rounded-full capitalize transition-colors ${
                fStatus === s ? "bg-ink text-paper" : "text-ash hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select value={fScene} onChange={(e) => setFScene(e.target.value)} className={selectCls}>
          <option value="all">All scenes</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{shortScene(s)}</option>
          ))}
        </select>
        <select value={fDept} onChange={(e) => setFDept(e.target.value)} className={selectCls}>
          <option value="all">All departments</option>
          {DEPARTMENTS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-bone rounded-card p-6 text-center">
          <p className="text-body-md text-ash">Nothing here yet.</p>
          <p className="text-body-xs text-muted mt-1">Designers can post questions tied to a scene or department; the SM and director get notified.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const qReplies = repliesByQ.get(q.id) || [];
            const isOpen = expanded.has(q.id);
            const canDelete = canResolve || q.author_person_id === viewerPersonId;
            return (
              <div key={q.id} className="bg-card border border-bone rounded-card p-3">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-body-xs font-medium capitalize ${STATUS_BADGE[q.status] || "bg-ash/10 text-ash"}`}>
                    {q.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-ink whitespace-pre-wrap">{q.body}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-body-xs text-muted">
                      <span>{personName(q.author)}</span>
                      <span>·</span>
                      <span>{timeAgo(q.created_at)}</span>
                      {q.scene_id && sceneById.get(q.scene_id) && (
                        <span className="font-mono px-1.5 py-0.5 bg-bone/50 text-ash rounded">{shortScene(sceneById.get(q.scene_id))}</span>
                      )}
                      {q.department && (
                        <span className="px-1.5 py-0.5 bg-bone/50 text-ash rounded">{DEPT_LABEL[q.department] || q.department}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button onClick={() => toggle(q.id)} className="text-body-xs text-ash hover:text-ink transition-colors">
                    {qReplies.length > 0 ? `${qReplies.length} ${qReplies.length === 1 ? "reply" : "replies"}` : "Reply"}
                  </button>
                  {canResolve && (
                    <div className="flex gap-1 ml-auto">
                      {(["open", "answered", "resolved"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={busy || q.status === s}
                          onClick={() => changeStatus(q.id, s)}
                          className={`px-2 py-0.5 text-body-xs rounded-full capitalize transition-colors ${
                            q.status === s ? "bg-ink text-paper" : "border border-bone text-ash hover:text-ink"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {canDelete && (
                    <button onClick={() => removeQuestion(q.id)} className={`text-body-xs text-conflict hover:underline transition-colors ${canResolve ? "" : "ml-auto"}`}>
                      Delete
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-3 pl-3 border-l-2 border-bone space-y-2">
                    {qReplies.map((r) => {
                      const canDelR = canResolve || r.author_person_id === viewerPersonId;
                      return (
                        <div key={r.id} className="group">
                          <p className="text-body-sm text-ink whitespace-pre-wrap">{r.body}</p>
                          <div className="flex items-center gap-2 text-body-xs text-muted">
                            <span>{personName(r.author)}</span>
                            <span>·</span>
                            <span>{timeAgo(r.created_at)}</span>
                            {canDelR && (
                              <button onClick={() => removeReply(r.id)} className="text-conflict opacity-0 group-hover:opacity-100 hover:underline transition-opacity">
                                delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={drafts[q.id] || ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(q.id); } }}
                        placeholder="Write a reply..."
                        className="flex-1 px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                      />
                      <button
                        disabled={busy || !(drafts[q.id] || "").trim()}
                        onClick={() => submitReply(q.id)}
                        className="px-3 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
