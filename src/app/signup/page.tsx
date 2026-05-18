"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SignupPage() {
  const [step, setStep] = useState<"account" | "profile">("account");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Account fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [birthDay, setBirthDay] = useState<number | "">("");
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bio, setBio] = useState("");

  const currentYear = new Date().getFullYear();
  const dayOptions = birthMonth
    ? Array.from(
        { length: new Date(currentYear, Number(birthMonth), 0).getDate() },
        (_, i) => i + 1
      )
    : [];

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

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: "" } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("profile");
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // Create person record
    const { data: personId, error: profileError } = await supabase.rpc(
      "ensure_person_profile",
      { p_full_name: fullName, p_email: email }
    );

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Update with full profile data
    const { error: updateError } = await supabase
      .from("people")
      .update({
        full_name: fullName,
        preferred_name: preferredName || null,
        pronouns: pronouns || null,
        phone: phone || null,
        bio: bio || null,
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

    router.push("/directory");
    router.refresh();
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";
  const labelClass = "block text-body-sm text-ash mb-1.5";

  // Step 1: Create account
  if (step === "account") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-display-lg text-center mb-2">
            Calltime<span className="text-brick">.</span>
          </h1>
          <p className="text-body-md text-ash text-center mb-10">
            Production management for theatre.
          </p>

          <form onSubmit={handleAccountSubmit} className="space-y-4">
            {error && (
              <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="text-body-xs text-muted mt-1">At least 8 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="text-center text-body-sm text-ash mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-ink underline underline-offset-2 hover:text-brick transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Build your profile
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="font-display text-display-md text-center mb-2">
          Your profile
        </h1>
        <p className="text-body-md text-ash text-center mb-8">
          The basics. You can always update this later.
        </p>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Full name <span className="text-brick">*</span></label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Phone <span className="text-brick">*</span></label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              className={inputClass}
              placeholder="(555) 555-5555"
            />
          </div>

          {/* Birthday */}
          <div>
            <label className={labelClass}>Birthday <span className="text-brick">*</span></label>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={birthMonth}
                onChange={(e) => {
                  setBirthMonth(e.target.value ? Number(e.target.value) : "");
                  setBirthDay("");
                }}
                required
                className={inputClass}
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
                required
                className={`${inputClass} disabled:opacity-50`}
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
                required
                min={1920}
                max={currentYear}
                className={inputClass}
              />
            </div>
            <p className="text-body-xs text-muted mt-1">
              Month and day may be shared with your company. Birth year stays private.
            </p>
          </div>

          {/* Optional section */}
          <div className="pt-4 border-t border-bone">
            <p className="text-body-xs text-muted uppercase tracking-wider mb-4">Optional</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Preferred name</label>
                  <input
                    type="text"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="What you go by"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Pronouns</label>
                  <input
                    type="text"
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value)}
                    placeholder="e.g. he/him"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A short intro — your background, what you do in theatre"
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !fullName || !phone || !birthMonth || !birthDay || !birthYear}
            className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "Saving..." : "Find a company"}
          </button>
        </form>
      </div>
    </div>
  );
}
