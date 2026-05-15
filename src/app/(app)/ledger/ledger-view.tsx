"use client";

import { useState, useRef, useEffect } from "react";
import { signContract, countersignContract, markContractViewed, updateContract, deleteContract } from "./ledger-actions";
import { useRouter } from "next/navigation";

// Inline editable cell for contract fields
function ContractEditCell({ value, onSave, className = "" }: {
  value: string; onSave: (v: string) => void; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`cursor-pointer hover:bg-bone/40 px-1 -mx-1 rounded transition-colors ${className}`}
        title="Click to edit"
      >
        {value || "\u00A0"}
      </span>
    );
  }

  return (
    <input
      ref={ref} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="px-1 -mx-1 bg-card border border-brick/40 rounded text-body-sm text-ink focus:outline-none"
    />
  );
}

interface Contract {
  id: string;
  person_name: string;
  person_id: string;
  role_title: string;
  compensation: string | null;
  status: string;
  signed_at: string | null;
  countersigned_at: string | null;
  viewed_at: string | null;
  template_id: string;
  production_id: string;
}

interface Template {
  id: string;
  contract_type: string;
  title: string;
  body_markdown: string;
}

interface Props {
  contracts: Contract[];
  templates: Template[];
  canManage: boolean;
  canSeeContent: boolean;
  personId: string;
  personName: string;
}

type StatusFilter = "all" | "pending" | "signed" | "countersigned";

function statusColor(status: string) {
  switch (status) {
    case "countersigned": return "text-confirmed bg-confirmed/10";
    case "signed": return "text-tentative bg-tentative/10";
    default: return "text-conflict bg-conflict/10";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "countersigned": return "Complete";
    case "signed": return "Awaiting countersign";
    default: return "Pending";
  }
}

function renderContractBody(template: Template, contract: Contract) {
  let body = template.body_markdown;
  body = body.replace(/\{\{PERSON_NAME\}\}/g, contract.person_name);
  body = body.replace(/\{\{ROLE_TITLE\}\}/g, contract.role_title);
  body = body.replace(/\{\{COMPENSATION\}\}/g, contract.compensation || "TBD");
  return body;
}

export function LedgerView({ contracts, templates, canManage, canSeeContent, personId, personName }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [signatureName, setSignatureName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [counterSignName, setCounterSignName] = useState("");
  const router = useRouter();

  const selected = contracts.find((c) => c.id === selectedId);
  const template = selected ? templates.find((t) => t.id === selected.template_id) : null;

  const filtered = filter === "all" ? contracts : contracts.filter((c) => c.status === filter);

  const counts = {
    total: contracts.length,
    pending: contracts.filter((c) => c.status === "pending").length,
    signed: contracts.filter((c) => c.status === "signed").length,
    countersigned: contracts.filter((c) => c.status === "countersigned").length,
  };

  async function openContract(contract: Contract) {
    setSelectedId(contract.id);
    setSignatureName("");
    setAgreed(false);
    setCounterSignName("");
    if (!contract.viewed_at && contract.person_id === personId) {
      markContractViewed(contract.id);
    }
  }

  async function handleSign() {
    if (!selected || !signatureName.trim() || !agreed) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("contract_id", selected.id);
    fd.set("signature_typed", signatureName);
    const result = await signContract(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setSelectedId(null);
      router.refresh();
    }
  }

  async function handleCountersign() {
    if (!selected || !counterSignName.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("contract_id", selected.id);
    fd.set("signature_typed", counterSignName);
    const result = await countersignContract(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setSelectedId(null);
      router.refresh();
    }
  }

  async function saveContractField(id: string, field: string, value: string) {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, value);
    const result = await updateContract(fd);
    setSaving(false);
    if (result.error) alert(result.error);
    else router.refresh();
  }

  async function handleDeleteContract(id: string) {
    if (!confirm("Remove this contract? This cannot be undone.")) return;
    setSaving(true);
    const result = await deleteContract(id);
    setSaving(false);
    if (result.error) alert(result.error);
    else {
      setSelectedId(null);
      router.refresh();
    }
  }

  // Contract detail view
  if (selected && template) {
    const body = renderContractBody(template, selected);
    const isMine = selected.person_id === personId;
    const canSign = isMine && selected.status === "pending";
    const canCountersign = canSeeContent && selected.status === "signed";
    // Only show full content to owners or the person whose contract it is
    const showContent = canSeeContent || isMine;

    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          className="text-body-sm text-ash hover:text-ink mb-4 transition-colors"
        >
          ← Back to contracts
        </button>

        <div className="bg-card border border-bone rounded-card overflow-hidden">
          {/* Contract header */}
          <div className="px-6 py-4 border-b border-bone">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-display text-display-sm text-ink">{template.title}</h2>
                <p className="text-body-sm text-ash mt-0.5">
                  {canSeeContent ? (
                    <>
                      <ContractEditCell
                        value={selected.person_name}
                        onSave={(v) => saveContractField(selected.id, "person_name", v)}
                      />
                      {" — "}
                      <ContractEditCell
                        value={selected.role_title}
                        onSave={(v) => saveContractField(selected.id, "role_title", v)}
                      />
                      {" — "}
                      <ContractEditCell
                        value={selected.compensation || "TBD"}
                        onSave={(v) => saveContractField(selected.id, "compensation", v)}
                        className="font-mono"
                      />
                    </>
                  ) : (
                    <>
                      {selected.person_name} — {selected.role_title}
                      {showContent && selected.compensation && ` — ${selected.compensation}`}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-body-xs font-medium px-2 py-1 rounded-full ${statusColor(selected.status)}`}>
                  {statusLabel(selected.status)}
                </span>
                {canSeeContent && selected.status === "pending" && (
                  <button
                    onClick={() => handleDeleteContract(selected.id)}
                    className="text-body-xs text-muted hover:text-conflict transition-colors"
                    title="Remove contract"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          </div>

          {showContent ? (
            /* Full contract body — visible to owners + the person signing */
            <div className="px-6 py-6">
            {/* Letterhead */}
            <div className="text-center mb-6 pb-4 border-b border-bone">
              <p className="font-display text-display-sm text-ink">Heritage Parc / Black Theatre Experience</p>
              <p className="text-body-sm text-ash">SWLA Juneteenth Committee</p>
              <p className="text-body-md font-medium text-ink mt-3">THE JUNETEENTH STORY</p>
              <p className="text-body-sm text-ash italic">Written by Twana Benoit · Directed by Josiah Price</p>
            </div>

            {/* Rendered contract text */}
            <div className="prose-contract space-y-3">
              {body.split("\n").map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2" />;
                if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                  const text = trimmed.replace(/\*\*/g, "");
                  return <p key={i} className="font-medium text-ink text-body-md">{text}</p>;
                }
                if (trimmed.startsWith("■")) {
                  return (
                    <p key={i} className="text-body-sm text-ink pl-4">
                      • {trimmed.slice(1).trim()}
                    </p>
                  );
                }
                // Bold segments within line
                const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <p key={i} className="text-body-sm text-ink leading-relaxed">
                    {parts.map((part, j) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
                      ) : (
                        <span key={j}>{part}</span>
                      )
                    )}
                  </p>
                );
              })}
            </div>

            {/* Signature status */}
            {selected.signed_at && (
              <div className="mt-8 pt-4 border-t border-bone">
                <p className="text-body-sm text-confirmed font-medium">
                  ✓ Signed by {selected.person_name} on{" "}
                  {new Date(selected.signed_at).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              </div>
            )}

            {selected.countersigned_at && (
              <div className="mt-2">
                <p className="text-body-sm text-confirmed font-medium">
                  ✓ Countersigned on{" "}
                  {new Date(selected.countersigned_at).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>
          ) : (
            /* Status-only view for production tier (Director, SM, ASM) */
            <div className="px-6 py-8 text-center">
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <span className={`text-body-sm font-medium px-3 py-1.5 rounded-full ${statusColor(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>

                {selected.signed_at && (
                  <p className="text-body-sm text-confirmed">
                    Signed on{" "}
                    {new Date(selected.signed_at).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </p>
                )}

                {selected.countersigned_at && (
                  <p className="text-body-sm text-confirmed">
                    Countersigned on{" "}
                    {new Date(selected.countersigned_at).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </p>
                )}

                {selected.status === "pending" && !selected.viewed_at && (
                  <p className="text-body-xs text-muted">Contract has not been viewed yet.</p>
                )}
                {selected.status === "pending" && selected.viewed_at && (
                  <p className="text-body-xs text-muted">
                    Viewed on{" "}
                    {new Date(selected.viewed_at).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </p>
                )}

                <p className="text-body-xs text-muted mt-4">Contract content is only visible to the contract holder and the producer.</p>
              </div>
            </div>
          )}
          {canSign && showContent && (
            <div className="px-6 py-6 bg-paper border-t border-bone">
              <h3 className="font-display text-display-sm text-ink mb-3">Sign this contract</h3>
              <p className="text-body-sm text-ash mb-4">
                By typing your full legal name below and checking the box, you agree to the terms and expectations outlined in this agreement.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-body-xs text-muted uppercase tracking-wider">
                    Type your full legal name
                  </label>
                  <input
                    type="text"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    placeholder={selected.person_name}
                    className="mt-1 w-full px-3 py-2 bg-card border border-bone rounded text-body-md text-ink font-display italic placeholder:text-muted focus:border-brick focus:outline-none"
                  />
                </div>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 accent-brick"
                  />
                  <span className="text-body-sm text-ink">
                    I have read and agree to the terms and expectations outlined in this agreement.
                  </span>
                </label>

                <button
                  onClick={handleSign}
                  disabled={!signatureName.trim() || !agreed || saving}
                  className="w-full py-3 bg-brick text-paper font-medium rounded-card text-body-md hover:bg-brick/90 disabled:opacity-40 disabled:cursor-default transition-colors"
                >
                  {saving ? "Signing…" : "Sign Contract"}
                </button>
              </div>
            </div>
          )}

          {/* Countersign area — owners only */}
          {canCountersign && (
            <div className="px-6 py-6 bg-paper border-t border-bone">
              <h3 className="font-display text-display-sm text-ink mb-3">Countersign</h3>
              <p className="text-body-sm text-ash mb-4">
                {selected.person_name} has signed. Type your name to countersign.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={counterSignName}
                  onChange={(e) => setCounterSignName(e.target.value)}
                  placeholder="Producer signature"
                  className="w-full px-3 py-2 bg-card border border-bone rounded text-body-md text-ink font-display italic placeholder:text-muted focus:border-brick focus:outline-none"
                />

                <button
                  onClick={handleCountersign}
                  disabled={!counterSignName.trim() || saving}
                  className="w-full py-3 bg-confirmed text-paper font-medium rounded-card text-body-md hover:bg-confirmed/90 disabled:opacity-40 disabled:cursor-default transition-colors"
                >
                  {saving ? "Countersigning…" : "Countersign Contract"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      {/* Status summary for owners */}
      {canManage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {([
            { label: "Total", value: counts.total, key: "all" as StatusFilter },
            { label: "Pending", value: counts.pending, key: "pending" as StatusFilter },
            { label: "Signed", value: counts.signed, key: "signed" as StatusFilter },
            { label: "Complete", value: counts.countersigned, key: "countersigned" as StatusFilter },
          ]).map((stat) => (
            <button
              key={stat.key}
              onClick={() => setFilter(stat.key)}
              className={`bg-card border rounded-card px-4 py-3 text-left transition-colors ${
                filter === stat.key ? "border-brick" : "border-bone hover:border-ash"
              }`}
            >
              <p className="font-mono text-data-md text-ink">{stat.value}</p>
              <p className="text-body-xs text-ash">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Contract list */}
      <div className="space-y-2">
        {filtered.map((contract) => {
          const isMine = contract.person_id === personId;
          return (
            <button
              key={contract.id}
              onClick={() => openContract(contract)}
              className="w-full bg-card border border-bone rounded-card px-4 py-3 flex items-center justify-between gap-3 hover:border-ash transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-body-md text-ink font-medium truncate">
                  {contract.person_name}
                  {isMine && <span className="text-brick ml-1 text-body-xs">(you)</span>}
                </p>
                <p className="text-body-sm text-ash truncate">
                  {contract.role_title}
                  {(canSeeContent || isMine) && contract.compensation && ` · ${contract.compensation}`}
                </p>
              </div>
              <span className={`text-body-xs font-medium px-2 py-1 rounded-full shrink-0 ${statusColor(contract.status)}`}>
                {statusLabel(contract.status)}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">No contracts match this filter.</p>
        </div>
      )}
    </div>
  );
}
