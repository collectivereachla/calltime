"use client";

import { useState } from "react";
import { approveApplication, declineApplication } from "./actions";

const DEPARTMENTS = [
  { value: "cast", label: "Cast" },
  { value: "crew", label: "Crew" },
  { value: "design", label: "Design" },
  { value: "directing", label: "Directing" },
  { value: "music", label: "Music" },
  { value: "production", label: "Production" },
  { value: "stage_management", label: "Stage Management" },
];

const ACCESS_TIERS = [
  { value: "member", label: "Member — basic access" },
  { value: "staff", label: "Staff — can edit schedules, roster" },
  { value: "production", label: "Production — full production access" },
  { value: "admin", label: "Admin — full access" },
];

interface Props {
  application: {
    id: string;
    type: string;
    departmentInterest: string | null;
    roleInterest: string | null;
    message: string | null;
    createdAt: string;
  };
  person: {
    name: string;
    fullName: string;
    email: string;
    phone: string | null;
    bio: string | null;
    headshotUrl: string | null;
    pronouns: string | null;
  };
  production: {
    id: string;
    title: string;
  };
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ApplicationReview({ application, person, production }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [role, setRole] = useState(application.roleInterest || "");
  const [department, setDepartment] = useState(application.departmentInterest || "cast");
  const [accessTier, setAccessTier] = useState("member");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "w-full px-3 py-2 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors";

  async function handleApprove() {
    if (!role.trim()) {
      setError("Assign a role before approving.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await approveApplication(application.id, role.trim(), department, accessTier);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone("accepted");
    }
  }

  async function handleDecline() {
    setError(null);
    setLoading(true);
    const result = await declineApplication(application.id);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone("declined");
    }
  }

  if (done) {
    return (
      <div className={`bg-card border rounded-card p-4 ${
        done === "accepted" ? "border-confirmed/30" : "border-bone"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-body-md text-ink font-medium">{person.name}</span>
            <span className="text-body-sm text-muted">{production.title}</span>
          </div>
          <span className={`text-body-xs px-2 py-0.5 rounded-full ${
            done === "accepted" ? "bg-confirmed/10 text-confirmed" : "bg-brick/10 text-brick"
          }`}>
            {done === "accepted" ? `Approved → ${role}` : "Declined"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-bone rounded-card overflow-hidden">
      {/* Summary row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-paper/50 transition-colors"
      >
        {person.headshotUrl ? (
          <img src={person.headshotUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-bone/50 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-body-md text-ash">{person.name.charAt(0)}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-body-md text-ink font-medium">{person.name}</span>
            {person.pronouns && <span className="text-body-xs text-muted">{person.pronouns}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-body-sm text-ash">{production.title}</span>
            <span className="text-body-xs px-1.5 py-0.5 rounded bg-bone/50 text-muted capitalize">
              {application.type}
            </span>
            {application.roleInterest && (
              <span className="text-body-xs text-ash">→ {application.roleInterest}</span>
            )}
          </div>
        </div>
        <span className="text-body-xs text-muted flex-shrink-0">{timeAgo(application.createdAt)}</span>
        <span className="text-muted flex-shrink-0">{expanded ? "−" : "+"}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-bone/50 pt-4 space-y-4">
          {/* Contact info */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
            <span className="text-ash">{person.email}</span>
            {person.phone && <span className="text-ash">{person.phone}</span>}
          </div>

          {/* Bio */}
          {person.bio && (
            <p className="text-body-sm text-ash">{person.bio}</p>
          )}

          {/* Their message */}
          {application.message && (
            <div className="bg-paper rounded-card p-3">
              <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Their note</p>
              <p className="text-body-sm text-ink">{application.message}</p>
            </div>
          )}

          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-3 py-2">
              {error}
            </div>
          )}

          {/* Assignment controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-body-xs text-muted mb-1">Role</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Ensemble, Sound Board Op"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-body-xs text-muted mb-1">Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass}>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-body-xs text-muted mb-1">Access</label>
              <select value={accessTier} onChange={(e) => setAccessTier(e.target.value)} className={inputClass}>
                {ACCESS_TIERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="px-5 py-2 bg-confirmed text-paper text-body-sm font-medium rounded-card hover:bg-confirmed/90 transition-colors disabled:opacity-50"
            >
              {loading ? "..." : "Approve"}
            </button>
            <button
              onClick={handleDecline}
              disabled={loading}
              className="px-5 py-2 bg-card border border-bone text-ash text-body-sm rounded-card hover:border-brick hover:text-brick transition-colors disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
