"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updatePublicProfile, updatePrivateDetails, uploadHeadshot, toggleW9Status } from "./actions";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  personId: string;
  orgId: string;
  isSelf: boolean;
  isStaff: boolean;
  current: {
    bio: string | null;
    headshot_url: string | null;
    birth_month: number | null;
    birth_day: number | null;
  };
  details: {
    birth_year: number | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    allergies: string | null;
    dietary_needs: string | null;
    w9_submitted: boolean;
    w9_submitted_at: string | null;
  } | null;
}

function compressImage(file: File, maxDim = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;
      if (width > height) {
        if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
  });
}

export function EditProfile({ personId, orgId, isSelf, isStaff, current, details }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit states
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field values
  const [bio, setBio] = useState(current.bio || "");
  const [birthMonth, setBirthMonth] = useState<number | "">(current.birth_month || "");
  const [birthDay, setBirthDay] = useState<number | "">(current.birth_day || "");
  const [birthYear, setBirthYear] = useState<number | "">(details?.birth_year || "");
  const [ecName, setEcName] = useState(details?.emergency_contact_name || "");
  const [ecPhone, setEcPhone] = useState(details?.emergency_contact_phone || "");
  const [ecRelationship, setEcRelationship] = useState(details?.emergency_contact_relationship || "");
  const [allergies, setAllergies] = useState(details?.allergies || "");
  const [dietaryNeeds, setDietaryNeeds] = useState(details?.dietary_needs || "");

  const canEdit = isSelf || isStaff;
  const currentYear = new Date().getFullYear();
  const dayOptions = birthMonth ? Array.from({ length: new Date(currentYear, Number(birthMonth), 0).getDate() }, (_, i) => i + 1) : [];

  async function save(section: string) {
    setError(null);
    setSaving(true);

    try {
      let result: { error?: string; success?: boolean };

      switch (section) {
        case "bio":
          result = await updatePublicProfile(personId, { bio: bio.trim() || null });
          break;
        case "birthday":
          result = await updatePublicProfile(personId, {
            birth_month: birthMonth || null,
            birth_day: birthDay || null,
          });
          if (result.success && birthYear) {
            const detailResult = await updatePrivateDetails(personId, orgId, { birth_year: Number(birthYear) });
            if (detailResult.error) result = detailResult;
          }
          break;
        case "emergency":
          result = await updatePrivateDetails(personId, orgId, {
            emergency_contact_name: ecName.trim() || null,
            emergency_contact_phone: ecPhone.trim() || null,
            emergency_contact_relationship: ecRelationship.trim() || null,
          });
          break;
        case "allergies":
          result = await updatePrivateDetails(personId, orgId, {
            allergies: allergies.trim() || null,
            dietary_needs: dietaryNeeds.trim() || null,
          });
          break;
        default:
          result = { error: "Unknown section" };
      }

      setSaving(false);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(null);
        router.refresh();
      }
    } catch (e: unknown) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  async function handleHeadshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const dataUrl = await compressImage(file);
      const result = await uploadHeadshot(personId, dataUrl);
      setSaving(false);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (e: unknown) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
  }

  async function handleW9Toggle() {
    setSaving(true);
    try {
      const result = await toggleW9Status(personId, !(details?.w9_submitted));
      setSaving(false);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (e: unknown) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Update failed.");
    }
  }

  if (!canEdit) return null;

  function SectionHeader({ label, section }: { label: string; section: string }) {
    return (
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-xs text-muted uppercase tracking-wider">{label}</span>
        {editing !== section ? (
          <button
            onClick={() => setEditing(section)}
            className="text-body-xs text-ash hover:text-brick transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => save(section)}
              disabled={saving}
              className="text-body-xs font-medium text-brick hover:text-brick/80 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="text-body-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-6">
      {error && (
        <div className="text-body-xs text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-2">
          {error}
        </div>
      )}

      <h2 className="text-body-xs text-muted uppercase tracking-wider">
        {isSelf ? "Edit your profile" : "Edit member profile"}
      </h2>

      {/* Headshot */}
      <div className="bg-card border border-bone rounded-card px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-body-xs text-muted uppercase tracking-wider">Headshot</span>
          <label className="text-body-xs text-ash hover:text-brick transition-colors cursor-pointer">
            {current.headshot_url ? "Change" : "Upload"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHeadshot}
              disabled={saving}
            />
          </label>
        </div>
        {!current.headshot_url && (
          <p className="text-body-xs text-muted mt-1 italic">No headshot uploaded</p>
        )}
      </div>

      {/* Bio */}
      <div className="bg-card border border-bone rounded-card px-5 py-4">
        <SectionHeader label="Bio" section="bio" />
        {editing === "bio" ? (
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="A short bio for the program..."
            className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none resize-none"
          />
        ) : (
          <p className="text-body-sm text-ink">
            {current.bio || <span className="text-muted italic">Not provided</span>}
          </p>
        )}
      </div>

      {/* Birthday */}
      <div className="bg-card border border-bone rounded-card px-5 py-4">
        <SectionHeader label="Birthday" section="birthday" />
        {editing === "birthday" ? (
          <div className="grid grid-cols-3 gap-2">
            <select
              value={birthMonth}
              onChange={(e) => { setBirthMonth(e.target.value ? Number(e.target.value) : ""); setBirthDay(""); }}
              className="px-2 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none"
            >
              <option value="">Month</option>
              {MONTHS.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={birthDay}
              onChange={(e) => setBirthDay(e.target.value ? Number(e.target.value) : "")}
              disabled={!birthMonth}
              className="px-2 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink focus:border-brick focus:outline-none disabled:opacity-50"
            >
              <option value="">Day</option>
              {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              type="number"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : "")}
              placeholder="Year"
              min={1920}
              max={currentYear}
              className="px-2 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
            />
          </div>
        ) : (
          <p className="text-body-sm text-ink">
            {current.birth_month && current.birth_day
              ? `${MONTHS[current.birth_month]} ${current.birth_day}${details?.birth_year ? `, ${details.birth_year}` : ""}`
              : <span className="text-muted italic">Not provided</span>
            }
          </p>
        )}
      </div>

      {/* Emergency Contact */}
      <div className="bg-card border border-bone rounded-card px-5 py-4">
        <SectionHeader label="Emergency contact" section="emergency" />
        {editing === "emergency" ? (
          <div className="space-y-2">
            <input
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={ecPhone}
                onChange={(e) => setEcPhone(e.target.value)}
                placeholder="Phone"
                type="tel"
                className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
              />
              <input
                value={ecRelationship}
                onChange={(e) => setEcRelationship(e.target.value)}
                placeholder="Relationship"
                className="px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div>
            {details?.emergency_contact_name ? (
              <>
                <span className="text-body-sm text-ink font-medium">{details.emergency_contact_name}</span>
                {details.emergency_contact_relationship && (
                  <span className="text-body-sm text-muted"> ({details.emergency_contact_relationship})</span>
                )}
                {details.emergency_contact_phone && (
                  <span className="block font-mono text-data-sm text-ash mt-0.5">{details.emergency_contact_phone}</span>
                )}
              </>
            ) : (
              <span className="text-body-sm text-muted italic">Not provided</span>
            )}
          </div>
        )}
      </div>

      {/* Allergies & Dietary */}
      <div className="bg-card border border-bone rounded-card px-5 py-4">
        <SectionHeader label="Allergies & dietary needs" section="allergies" />
        {editing === "allergies" ? (
          <div className="space-y-2">
            <input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Allergies (food, environmental, other)"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
            />
            <input
              value={dietaryNeeds}
              onChange={(e) => setDietaryNeeds(e.target.value)}
              placeholder="Dietary needs (vegetarian, halal, etc.)"
              className="w-full px-3 py-2 bg-paper border border-bone rounded-card text-body-sm text-ink placeholder:text-muted focus:border-brick focus:outline-none"
            />
          </div>
        ) : (
          <div>
            <p className="text-body-sm text-ink">
              {details?.allergies || <span className="text-muted italic">No allergies listed</span>}
            </p>
            {details?.dietary_needs && (
              <p className="text-body-sm text-ash mt-0.5">{details.dietary_needs}</p>
            )}
          </div>
        )}
      </div>

      {/* W9 — staff only */}
      {isStaff && (
        <div className="bg-card border border-bone rounded-card px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-body-xs text-muted uppercase tracking-wider block">W-9</span>
              <span className={`text-body-sm ${details?.w9_submitted ? "text-confirmed font-medium" : "text-muted italic"}`}>
                {details?.w9_submitted
                  ? `Received${details.w9_submitted_at ? ` · ${new Date(details.w9_submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`
                  : "Not received"
                }
              </span>
            </div>
            <button
              onClick={handleW9Toggle}
              disabled={saving}
              className={`px-3 py-1.5 text-body-xs font-medium rounded-card transition-colors disabled:opacity-50 ${
                details?.w9_submitted
                  ? "text-ash border border-bone hover:text-ink"
                  : "text-paper bg-ink hover:bg-ink/90"
              }`}
            >
              {details?.w9_submitted ? "Mark not received" : "Mark received"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
