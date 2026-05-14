"use client";

import { useState } from "react";
import { updateMember, updateMemberRole, updateAssignment, addAssignment, removeMember } from "./actions";
import { useRouter } from "next/navigation";

const orgRoles = [
  { value: "owner", label: "Owner" },
  { value: "production", label: "Production" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

const departments = [
  { value: "directing", label: "Directing" },
  { value: "stage_management", label: "Stage Management" },
  { value: "cast", label: "Cast" },
  { value: "design", label: "Design" },
  { value: "crew", label: "Crew" },
  { value: "music", label: "Music" },
  { value: "production", label: "Production" },
  { value: "marketing", label: "Marketing" },
];

const accessTiers = [
  { value: "owner", label: "Owner" },
  { value: "production", label: "Production" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

const castingOptions = [
  { value: "", label: "N/A" },
  { value: "single_cast", label: "Single cast" },
  { value: "rotating_cast", label: "Rotating cast" },
  { value: "track_sharing", label: "Track sharing" },
  { value: "understudy", label: "Understudy" },
  { value: "swing", label: "Swing" },
];

interface PersonData {
  id: string;
  full_name: string;
  preferred_name: string | null;
  pronouns: string | null;
  email: string | null;
  phone: string | null;
}

interface Assignment {
  id: string;
  role_title: string;
  department: string | null;
  access_tier: string;
  casting_structure: string | null;
  production_title: string;
}

interface Production {
  id: string;
  title: string;
}

interface Props {
  person: PersonData;
  orgId: string;
  orgRole: string;
  assignments: Assignment[];
  productions: Production[];
  isCurrentUser: boolean;
}

export function EditMemberButton({ person, orgId, orgRole, assignments, productions, isCurrentUser }: Props) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"profile" | "role" | "assignments">("profile");
  const [addingRole, setAddingRole] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState(orgRole);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function handleProfileSave(formData: FormData) {
    setError(null);
    setLoading(true);
    formData.set("person_id", person.id);
    const result = await updateMember(formData);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleRoleChange(role: string) {
    setError(null);
    setLoading(true);
    setCurrentRole(role);
    const result = await updateMemberRole(orgId, person.id, role);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    setLoading(false);
    router.refresh();
  }

  async function handleAddRole(formData: FormData) {
    setError(null);
    setLoading(true);
    formData.set("person_id", person.id);
    const result = await addAssignment(formData);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    setLoading(false);
    setAddingRole(false);
    router.refresh();
  }

  async function handleAssignmentSave(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await updateAssignment(formData);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    setLoading(false);
    router.refresh();
  }

  async function handleRemove() {
    setLoading(true);
    const result = await removeMember(orgId, person.id);
    if (result?.error) { setError(result.error); setLoading(false); return; }
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-body-xs text-muted hover:text-brick transition-colors shrink-0"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-bone">
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button onClick={() => setTab("profile")}
          className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${tab === "profile" ? "bg-ink text-paper" : "text-ash hover:text-ink"}`}>
          Profile
        </button>
        <button onClick={() => setTab("role")}
          className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${tab === "role" ? "bg-ink text-paper" : "text-ash hover:text-ink"}`}>
          Role
        </button>
        {assignments.length > 0 && (
          <button onClick={() => setTab("assignments")}
            className={`px-3 py-1 text-body-xs font-medium rounded-full transition-colors ${tab === "assignments" ? "bg-ink text-paper" : "text-ash hover:text-ink"}`}>
            Assignments ({assignments.length})
          </button>
        )}
      </div>

      {error && <div className="text-body-xs text-brick mb-3">{error}</div>}

      {/* Profile tab */}
      {tab === "profile" && (
        <form action={handleProfileSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Full name</label>
              <input name="full_name" type="text" defaultValue={person.full_name} required
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Preferred name</label>
              <input name="preferred_name" type="text" defaultValue={person.preferred_name || ""}
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-body-xs text-ash mb-1">Pronouns</label>
              <input name="pronouns" type="text" defaultValue={person.pronouns || ""}
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Email</label>
              <input name="email" type="email" defaultValue={person.email || ""}
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-body-xs text-ash mb-1">Phone</label>
              <input name="phone" type="tel" defaultValue={person.phone || ""}
                className="w-full px-3 py-1.5 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
              {loading ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Role tab */}
      {tab === "role" && (
        <div className="space-y-3">
          <div>
            <label className="block text-body-xs text-ash mb-2">Organization role</label>
            <div className="flex flex-wrap gap-2">
              {orgRoles.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRoleChange(r.value)}
                  disabled={loading || (r.value === "owner" && !isCurrentUser)}
                  className={`px-4 py-2 text-body-sm rounded-card border transition-colors ${
                    currentRole === r.value
                      ? "border-brick bg-brick/10 text-brick font-medium"
                      : "border-bone text-ash hover:border-ash hover:text-ink"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-body-xs text-muted mt-2">
              {currentRole === "owner" && "Full access. Can manage everything."}
              {currentRole === "production" && "All rooms. Own docs in Ledger. Can manage people."}
              {currentRole === "member" && "Callboard, Run, Spine, Press. Own Ledger docs."}
              {currentRole === "guest" && "Open Call only."}
            </p>
          </div>

          {/* Remove member */}
          {!isCurrentUser && (
            <div className="pt-3 border-t border-bone">
              {!confirming ? (
                <button onClick={() => setConfirming(true)}
                  className="text-body-xs text-muted hover:text-brick transition-colors">
                  Remove from organization
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-body-xs text-brick">Remove {person.preferred_name || person.full_name}?</span>
                  <button onClick={handleRemove} disabled={loading}
                    className="px-3 py-1 text-body-xs font-medium text-paper bg-brick rounded-card hover:bg-brick/90 disabled:opacity-50">
                    Remove
                  </button>
                  <button onClick={() => setConfirming(false)}
                    className="text-body-xs text-muted hover:text-ink transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Assignments tab */}
      {tab === "assignments" && (
        <div className="space-y-3">
          {assignments.map((a) => (
            <form key={a.id} action={handleAssignmentSave}
              className="bg-paper border border-bone rounded-card p-3">
              <input type="hidden" name="assignment_id" value={a.id} />
              <p className="text-body-xs text-muted mb-2 font-display italic">{a.production_title}</p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Role / Title</label>
                  <input name="role_title" type="text" defaultValue={a.role_title} required
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Department</label>
                  <select name="department" defaultValue={a.department || "cast"}
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {departments.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Access tier</label>
                  <select name="access_tier" defaultValue={a.access_tier}
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {accessTiers.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Casting</label>
                  <select name="casting_structure" defaultValue={a.casting_structure || ""}
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {castingOptions.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                {loading ? "Saving..." : "Save"}
              </button>
            </form>
          ))}

          {/* Add role */}
          {!addingRole ? (
            <button onClick={() => setAddingRole(true)}
              className="w-full py-2.5 border border-dashed border-bone rounded-card text-body-xs text-ash hover:text-brick hover:border-brick/30 transition-colors">
              + Add another role
            </button>
          ) : (
            <form action={handleAddRole}
              className="bg-brick/5 border border-dashed border-brick/20 rounded-card p-3">
              <p className="text-body-xs font-medium text-ink mb-2">New role for {person.preferred_name || person.full_name}</p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-body-xs text-ash mb-1">Production</label>
                  <select name="production_id" required
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {productions.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Role / Title</label>
                  <input name="role_title" type="text" required placeholder="e.g. Lincoln, Co-Director"
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Department</label>
                  <select name="department" defaultValue="cast"
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {departments.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-body-xs text-ash mb-1">Access tier</label>
                  <select name="access_tier" defaultValue="member"
                    className="w-full px-3 py-1.5 bg-card border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none transition-colors">
                    {accessTiers.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loading}
                  className="px-4 py-1.5 bg-ink text-paper text-body-xs font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50">
                  {loading ? "Adding..." : "Add role"}
                </button>
                <button type="button" onClick={() => setAddingRole(false)}
                  className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}

          <button onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-body-xs text-ash hover:text-ink transition-colors">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
