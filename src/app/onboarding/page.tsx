"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function OnboardingPage() {
  const [step, setStep] = useState<"profile" | "org">("profile");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Profile fields (public → people table)
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | "">(""  );
  const [birthDay, setBirthDay] = useState<number | "">("");

  // Private fields (→ member_details table)
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [allergies, setAllergies] = useState("");

  // Org fields
  const [orgSlug, setOrgSlug] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsOwner(user.id === "3f2c8560-c6eb-434f-9ade-2bffa981a125");
      const meta = user.user_metadata;
      if (meta?.full_name) setFullName(meta.full_name);
    }
    checkUser();
  }, [supabase.auth]);

  function computeIsMinor(): boolean {
    if (!birthYear || !birthMonth || !birthDay) return false;
    const today = new Date();
    const birth = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age < 18;
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Ensure person profile exists
    const { data: personId, error: profileError } = await supabase.rpc(
      "ensure_person_profile",
      { p_full_name: fullName, p_email: null }
    );

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Update public fields on people table
    const { error: updateError } = await supabase
      .from("people")
      .update({
        full_name: fullName,
        preferred_name: preferredName || null,
        pronouns: pronouns || null,
        phone: phone || null,
        birth_month: birthMonth || null,
        birth_day: birthDay || null,
        is_minor: computeIsMinor(),
        profile_complete: true,
      })
      .eq("id", personId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Insert private fields into member_details
    const { error: detailsError } = await supabase
      .from("member_details")
      .upsert({
        person_id: personId,
        birth_year: birthYear || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        emergency_contact_relationship: emergencyRelationship || null,
        allergies: allergies || null,
      }, { onConflict: "person_id" });

    if (detailsError) {
      setError(detailsError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("org");
  }

  async function handleJoinOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: joinError } = await supabase.rpc("join_org_as_guest", {
      p_org_slug: orgSlug.toLowerCase().trim(),
    });

    if (joinError) {
      setError(joinError.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: createError } = await supabase.rpc("create_org_with_owner", {
      org_name: newOrgName,
      org_slug: newOrgSlug,
    });

    if (createError) {
      setError(createError.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  const currentYear = new Date().getFullYear();
  const dayOptions = birthMonth ? Array.from({ length: new Date(currentYear, Number(birthMonth), 0).getDate() }, (_, i) => i + 1) : [];

  // Step 1: Profile
  if (step === "profile") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <h1 className="font-display text-display-md text-center mb-2">
            Your profile
          </h1>
          <p className="text-body-md text-ash text-center mb-8">
            This information helps your production team reach you.
          </p>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {error && (
              <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-body-sm text-ash mb-1.5">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-body-sm text-ash mb-1.5">Preferred name</label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="What you go by"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-body-sm text-ash mb-1.5">Pronouns</label>
                <input
                  type="text"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g. he/him, she/her"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-body-sm text-ash mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
            </div>

            {/* Birthday */}
            <div>
              <label className="block text-body-sm text-ash mb-1.5">Birthday</label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={birthMonth}
                  onChange={(e) => { setBirthMonth(e.target.value ? Number(e.target.value) : ""); setBirthDay(""); }}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink focus:border-brick focus:outline-none transition-colors"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value ? Number(e.target.value) : "")}
                  disabled={!birthMonth}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink focus:border-brick focus:outline-none transition-colors disabled:opacity-50"
                >
                  <option value="">Day</option>
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Year"
                  min={1920}
                  max={currentYear}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>
              <p className="text-body-xs text-muted mt-1">
                Your birthday (month & day) may be shared with your company. Birth year is private.
              </p>
            </div>

            {/* Emergency contact */}
            <div className="pt-2">
              <p className="text-body-xs text-muted uppercase tracking-wider mb-3">Emergency contact</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={emergencyRelationship}
                    onChange={(e) => setEmergencyRelationship(e.target.value)}
                    placeholder="Relationship"
                    className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-body-sm text-ash mb-1.5">Allergies</label>
              <input
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Food, environmental, or other"
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !fullName}
              className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 2: Join or create org
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="font-display text-display-md text-center mb-2">
          Join a company
        </h1>
        <p className="text-body-md text-ash text-center mb-8">
          Enter the organization code to join as a guest.
        </p>

        {error && (
          <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleJoinOrg} className="space-y-4 mb-8">
          <div>
            <label className="block text-body-sm text-ash mb-1.5">Organization code</label>
            <input
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
              placeholder="e.g. black-theatre-experience"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
            <p className="text-body-xs text-muted mt-1">
              Ask your stage manager or director for this code.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !orgSlug}
            className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Joining..." : "Join organization"}
          </button>
        </form>

        {isOwner && (
          <div className="border-t border-bone pt-6">
            <p className="text-body-xs text-muted uppercase tracking-wider mb-4">Platform owner</p>
            <form onSubmit={handleCreateOrg} className="space-y-3">
              <div>
                <label className="block text-body-sm text-ash mb-1.5">Organization name</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    setNewOrgSlug(generateSlug(e.target.value));
                  }}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-body-sm text-ash mb-1.5">Slug</label>
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !newOrgName || !newOrgSlug}
                className="w-full py-2.5 bg-brick text-paper font-body text-body-md font-medium rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create organization"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
