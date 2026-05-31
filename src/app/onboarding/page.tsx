"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Role = "invited" | "applying" | "creating" | "managing";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ROLE_CARDS: { role: Role; heading: string; description: string; icon: string }[] = [
  {
    role: "invited",
    heading: "I was invited to a production",
    description: "Someone from the company told you to sign up — you have a code or got an invite email.",
    icon: "✉️",
  },
  {
    role: "applying",
    heading: "I'm applying for an open call",
    description: "You want to audition, volunteer, or apply for a position with a company.",
    icon: "🎭",
  },
  {
    role: "creating",
    heading: "I'm creating a company",
    description: "You're a director, producer, or artistic leader starting a new organization on Calltime.",
    icon: "🏗️",
  },
  {
    role: "managing",
    heading: "I'm helping manage an existing company",
    description: "You're stage management, production staff, a board member, or admin for a company already on Calltime.",
    icon: "📋",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<"role" | "profile" | "action">("role");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [birthDay, setBirthDay] = useState<number | "">("");
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");

  // Org action fields
  const [orgSlug, setOrgSlug] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgCity, setNewOrgCity] = useState("");
  const [newOrgState, setNewOrgState] = useState("");

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const meta = user.user_metadata;
      if (meta?.full_name) setFullName(meta.full_name);

      // Check if profile already exists
      const { data: person } = await supabase
        .from("people")
        .select("id, full_name, preferred_name, pronouns, phone, profile_complete")
        .eq("user_id", user.id)
        .single();

      if (person) {
        setPersonId(person.id);
        setFullName(person.full_name || "");
        setPreferredName(person.preferred_name || "");
        setPronouns(person.pronouns || "");
        setPhone(person.phone || "");
        if (person.profile_complete) setProfileComplete(true);

        // Check if already has an org membership
        const { data: memberships } = await supabase
          .from("org_memberships")
          .select("id")
          .eq("person_id", person.id)
          .eq("status", "active")
          .limit(1);

        if (memberships && memberships.length > 0) {
          router.push("/home");
          return;
        }
      }

      setChecking(false);
    }
    check();
  }, [supabase, router]);

  function computeIsMinor(): boolean {
    if (!birthYear || !birthMonth || !birthDay) return false;
    const today = new Date();
    const birth = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  }

  function handleRoleSelect(role: Role) {
    setSelectedRole(role);
    if (profileComplete) {
      setStep("action");
    } else {
      setStep("profile");
    }
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: pid, error: profileError } = await supabase.rpc(
      "ensure_person_profile",
      { p_full_name: fullName, p_email: null }
    );

    if (profileError) { setError(profileError.message); setLoading(false); return; }
    setPersonId(pid);

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
      .eq("id", pid);

    if (updateError) { setError(updateError.message); setLoading(false); return; }

    // Emergency contact / birth year are written per-org once the person joins
    // one (see handleJoinOrg) — the org isn't known yet at this step, so we no
    // longer write them to a hardcoded organization.

    setProfileComplete(true);
    setLoading(false);

    // Route based on role
    if (selectedRole === "applying") {
      router.push("/directory");
      return;
    }
    setStep("action");
  }

  async function handleJoinOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const slug = orgSlug.toLowerCase().trim();
    const { error: joinError } = await supabase.rpc("join_org_as_guest", {
      p_org_slug: slug,
    });

    if (joinError) { setError(joinError.message); setLoading(false); return; }

    // Now that we know the org, persist the emergency contact / birth year there.
    if (personId && (emergencyName || emergencyPhone || birthYear)) {
      const { data: org } = await supabase
        .from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (org) {
        await supabase.from("member_details").upsert({
          person_id: personId,
          org_id: org.id,
          birth_year: birthYear || null,
          emergency_contact_name: emergencyName || null,
          emergency_contact_phone: emergencyPhone || null,
          emergency_contact_relationship: emergencyRelationship || null,
        }, { onConflict: "person_id,org_id" });
      }
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

    if (createError) { setError(createError.message); setLoading(false); return; }

    // Update city/state if provided
    if (newOrgCity || newOrgState) {
      await supabase
        .from("organizations")
        .update({ city: newOrgCity || null, state: newOrgState || null })
        .eq("slug", newOrgSlug);
    }

    router.push("/home");
    router.refresh();
  }

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  }

  const currentYear = new Date().getFullYear();
  const dayOptions = birthMonth
    ? Array.from({ length: new Date(currentYear, Number(birthMonth), 0).getDate() }, (_, i) => i + 1)
    : [];

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-body-md text-ash">Loading...</p>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";
  const labelClass = "block text-body-sm text-ash mb-1.5";
  const buttonClass = "w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  // ═══════════════════════════════════════════
  // STEP 1: What brings you here?
  // ═══════════════════════════════════════════
  if (step === "role") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          <h1 className="font-display text-display-md text-center mb-2">
            Welcome to Calltime<span className="text-brick">.</span>
          </h1>
          <p className="text-body-md text-ash text-center mb-10">
            What brings you here?
          </p>

          <div className="space-y-3">
            {ROLE_CARDS.map((card) => (
              <button
                key={card.role}
                onClick={() => handleRoleSelect(card.role)}
                className="w-full text-left bg-card border border-bone rounded-card p-5 hover:border-brick/40 hover:shadow-card transition-all group"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl mt-0.5 shrink-0">{card.icon}</span>
                  <div className="min-w-0">
                    <p className="text-body-md font-medium text-ink group-hover:text-brick transition-colors">
                      {card.heading}
                    </p>
                    <p className="text-body-sm text-ash mt-1">
                      {card.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // STEP 2: Your profile
  // ═══════════════════════════════════════════
  if (step === "profile") {
    const roleLabel = {
      invited: "Let's get you set up so your team can reach you.",
      applying: "A few basics so the company knows who you are.",
      creating: "Set up your account before creating your organization.",
      managing: "A few basics so your team knows who you are.",
    }[selectedRole!];

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <button
            onClick={() => setStep("role")}
            className="text-body-xs text-muted hover:text-ink transition-colors mb-6"
          >
            ← Back
          </button>

          <h1 className="font-display text-display-md mb-2">Your profile</h1>
          <p className="text-body-md text-ash mb-8">{roleLabel}</p>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {error && (
              <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className={labelClass}>Full name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                required className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Preferred name</label>
                <input type="text" value={preferredName} onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="What you go by" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Pronouns</label>
                <input type="text" value={pronouns} onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g. he/him" className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputClass} />
            </div>

            {/* Birthday — show for everyone, needed for minor detection */}
            <div>
              <label className={labelClass}>Birthday</label>
              <div className="grid grid-cols-3 gap-3">
                <select value={birthMonth}
                  onChange={(e) => { setBirthMonth(e.target.value ? Number(e.target.value) : ""); setBirthDay(""); }}
                  className={inputClass}>
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value ? Number(e.target.value) : "")}
                  disabled={!birthMonth} className={`${inputClass} disabled:opacity-50`}>
                  <option value="">Day</option>
                  {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <input type="number" value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Year" min={1920} max={currentYear} className={inputClass} />
              </div>
              <p className="text-body-xs text-muted mt-1">
                Month and day may be shared with your company. Birth year is private.
              </p>
            </div>

            {/* Emergency contact — show for invited, applying, managing */}
            {selectedRole !== "creating" && (
              <div className="pt-2">
                <p className="text-body-xs text-muted uppercase tracking-wider mb-3">Emergency contact</p>
                <div className="space-y-3">
                  <input type="text" value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Name" className={inputClass} />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="tel" value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      placeholder="Phone" className={inputClass} />
                    <input type="text" value={emergencyRelationship}
                      onChange={(e) => setEmergencyRelationship(e.target.value)}
                      placeholder="Relationship" className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading || !fullName} className={`${buttonClass} mt-2`}>
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // STEP 3: Role-specific action
  // ═══════════════════════════════════════════

  // --- INVITED or MANAGING: enter org code ---
  if (selectedRole === "invited" || selectedRole === "managing") {
    const isInvited = selectedRole === "invited";
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <button
            onClick={() => setStep(profileComplete ? "role" : "profile")}
            className="text-body-xs text-muted hover:text-ink transition-colors mb-6"
          >
            ← Back
          </button>

          <h1 className="font-display text-display-md mb-2">
            {isInvited ? "Join your production" : "Join your company"}
          </h1>
          <p className="text-body-md text-ash mb-8">
            {isInvited
              ? "Enter the code from your invitation — it's usually the company's name with dashes."
              : "Enter the organization code. Ask your director or producer if you don't have it."}
          </p>

          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleJoinOrg} className="space-y-4">
            <div>
              <label className={labelClass}>Organization code</label>
              <input type="text" value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                required placeholder="e.g. black-theatre-experience"
                className={`${inputClass} font-mono text-data-md`} />
            </div>
            <button type="submit" disabled={loading || !orgSlug} className={buttonClass}>
              {loading ? "Joining..." : "Join"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-bone">
            <p className="text-body-sm text-ash text-center">
              Don&apos;t have a code?{" "}
              <button
                onClick={() => { setSelectedRole("applying"); router.push("/directory"); }}
                className="text-ink underline underline-offset-2 hover:text-brick transition-colors"
              >
                Browse companies
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- CREATING: new organization ---
  if (selectedRole === "creating") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <button
            onClick={() => setStep(profileComplete ? "role" : "profile")}
            className="text-body-xs text-muted hover:text-ink transition-colors mb-6"
          >
            ← Back
          </button>

          <h1 className="font-display text-display-md mb-2">Create your company</h1>
          <p className="text-body-md text-ash mb-8">
            This sets up your organization on Calltime. You&apos;ll be the owner and can add productions, invite people, and manage everything from here.
          </p>

          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div>
              <label className={labelClass}>Company name</label>
              <input type="text" value={newOrgName}
                onChange={(e) => { setNewOrgName(e.target.value); setNewOrgSlug(generateSlug(e.target.value)); }}
                required placeholder="e.g. Heritage Players"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>URL slug</label>
              <div className="flex items-center gap-0">
                <span className="text-body-sm text-muted bg-bone/30 border border-bone border-r-0 rounded-l-card px-3 py-2.5">
                  checkcalltime.art/org/
                </span>
                <input type="text" value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                  className={`${inputClass} rounded-l-none font-mono text-data-md`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>City</label>
                <input type="text" value={newOrgCity}
                  onChange={(e) => setNewOrgCity(e.target.value)}
                  placeholder="e.g. Lafayette" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input type="text" value={newOrgState}
                  onChange={(e) => setNewOrgState(e.target.value)}
                  placeholder="e.g. LA" maxLength={2} className={inputClass} />
              </div>
            </div>
            <button type="submit" disabled={loading || !newOrgName || !newOrgSlug} className={`${buttonClass} mt-2`}>
              {loading ? "Creating..." : "Create company"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}
