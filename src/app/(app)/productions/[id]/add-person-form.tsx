"use client";

import { useState } from "react";
import { addPersonToProduction } from "@/app/(app)/productions/actions";
import { useRouter } from "next/navigation";

const departments = [
  { value: "directing", label: "Directing" },
  { value: "stage_management", label: "Stage Management" },
  { value: "cast", label: "Cast" },
  { value: "design", label: "Design" },
  { value: "crew", label: "Crew" },
  { value: "music", label: "Music" },
  { value: "production", label: "Production" },
  { value: "marketing", label: "Marketing" },
  { value: "video", label: "Video" },
];

const accessTiers = [
  { value: "admin", label: "Admin", description: "Full access to everything" },
  { value: "production", label: "Production", description: "All rooms, own docs in Ledger" },
  { value: "staff", label: "Staff", description: "Edit schedules, roster, design" },
  { value: "member", label: "Member", description: "Callboard, Spine, own Ledger docs" },
];

const castingOptions = [
  { value: "", label: "N/A" },
  { value: "single_cast", label: "Single cast" },
  { value: "rotating_cast", label: "Rotating cast" },
  { value: "understudy", label: "Understudy" },
  { value: "swing", label: "Swing" },
];

interface OrgMember {
  person_id: string;
  name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  productionId: string;
  orgMembers: OrgMember[];
}

export function AddPersonForm({ productionId, orgMembers }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"company" | "new">("company");
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selected = orgMembers.find(m => m.person_id === selectedMember);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    formData.set("production_id", productionId);

    // If selecting from company, use their existing data
    if (mode === "company" && selected) {
      formData.set("full_name", selected.full_name);
      if (selected.email) formData.set("email", selected.email);
      if (selected.phone) formData.set("phone", selected.phone);
    }

    const result = await addPersonToProduction(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    setOpen(false);
    setSelectedMember("");
    router.refresh();
  }

  const inputClass = "w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-dashed border-bone rounded-card text-body-sm text-ash hover:text-brick hover:border-brick/30 transition-colors"
      >
        + Add person to production
      </button>
    );
  }

  return (
    <div className="bg-card border border-bone rounded-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body-md font-medium text-ink">Add Person</h3>
        {orgMembers.length > 0 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setMode("company"); setSelectedMember(""); }}
              className={`px-3 py-1 text-body-xs rounded-full transition-colors ${
                mode === "company" ? "bg-ink text-paper" : "text-ash border border-bone hover:border-ash"
              }`}
            >
              From company
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`px-3 py-1 text-body-xs rounded-full transition-colors ${
                mode === "new" ? "bg-ink text-paper" : "text-ash border border-bone hover:border-ash"
              }`}
            >
              New person
            </button>
          </div>
        )}
      </div>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
            {error}
          </div>
        )}

        {mode === "company" && orgMembers.length > 0 ? (
          <>
            {/* Member picker */}
            <div>
              <label className="block text-body-xs text-ash mb-1">Select member</label>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose a company member...</option>
                {orgMembers.map(m => (
                  <option key={m.person_id} value={m.person_id}>
                    {m.name}{m.email ? ` — ${m.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selected && (
              <div className="bg-paper border border-bone/50 rounded-card px-4 py-3">
                <p className="text-body-sm text-ink font-medium">{selected.name}</p>
                <p className="text-body-xs text-muted">
                  {[selected.email, selected.phone].filter(Boolean).join(" · ") || "No contact info on file"}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Manual entry */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-body-xs text-ash mb-1">Full name</label>
                <input name="full_name" type="text" required className={inputClass} />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Email</label>
                <input name="email" type="email" className={inputClass} />
              </div>
              <div>
                <label className="block text-body-xs text-ash mb-1">Phone</label>
                <input name="phone" type="tel" className={inputClass} />
              </div>
            </div>
          </>
        )}

        {/* Role + Department + Access — always shown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-body-xs text-ash mb-1">Role / Title</label>
            <input name="role_title" type="text" required placeholder="Desdemona, Lighting Designer..." className={inputClass} />
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Department</label>
            <select name="department" required className={inputClass}>
              {departments.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-xs text-ash mb-1">Access level</label>
            <select name="access_tier" required defaultValue="member" className={inputClass}>
              {accessTiers.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Casting structure */}
        <div className="max-w-xs">
          <label className="block text-body-xs text-ash mb-1">Casting structure</label>
          <select name="casting_structure" className={inputClass}>
            {castingOptions.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-body-sm text-ash hover:text-ink transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (mode === "company" && !selectedMember)}
            className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add to production"}
          </button>
        </div>
      </form>
    </div>
  );
}
