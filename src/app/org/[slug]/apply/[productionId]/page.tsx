"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

const DEPARTMENTS = [
  { value: "cast", label: "Cast / Performer" },
  { value: "crew", label: "Crew / Technician" },
  { value: "design", label: "Design" },
  { value: "music", label: "Music" },
  { value: "directing", label: "Directing" },
  { value: "stage_management", label: "Stage Management" },
  { value: "production", label: "Production" },
];

const APPLICATION_TYPES: Record<string, string> = {
  audition: "Audition",
  crew: "Crew / Technician",
  design: "Design",
  music: "Music",
  other: "Other",
};

export default function ApplyPage() {
  const router = useRouter();
  const { slug, productionId } = useParams<{ slug: string; productionId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [production, setProduction] = useState<{
    title: string;
    playwright: string | null;
    application_types: string[];
    open_call_description: string | null;
  } | null>(null);
  const [orgName, setOrgName] = useState("");

  // Form fields
  const [type, setType] = useState("audition");
  const [departmentInterest, setDepartmentInterest] = useState("");
  const [roleInterest, setRoleInterest] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/org/${slug}/apply/${productionId}`);
        return;
      }

      // Fetch production + org
      const { data: prod } = await supabase
        .from("productions")
        .select("title, playwright, application_types, open_call_description, open_call_deadline, accepting_applications, organizations(name)")
        .eq("id", productionId)
        .single();

      if (!prod || !prod.accepting_applications) {
        router.push(`/org/${slug}`);
        return;
      }
      // Enforce the open-call deadline: closed once it has passed, even if the toggle is still on.
      if (prod.open_call_deadline && new Date(prod.open_call_deadline as string) < new Date()) {
        router.push(`/org/${slug}`);
        return;
      }

      setProduction({
        title: prod.title,
        playwright: prod.playwright,
        application_types: (prod.application_types as string[]) || [],
        open_call_description: prod.open_call_description,
      });
      setOrgName((prod.organizations as unknown as { name: string })?.name || "");

      // Default type to first available
      const types = (prod.application_types as string[]) || [];
      if (types.length > 0) setType(types[0]);

      setLoading(false);
    }
    load();
  }, [slug, productionId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();

    // Get person_id for current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: person } = await supabase
      .from("people")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!person) {
      setError("Please complete your profile first.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("applications")
      .insert({
        production_id: productionId,
        person_id: person.id,
        type,
        department_interest: departmentInterest || null,
        role_interest: roleInterest || null,
        message: message || null,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("You've already applied to this production.");
      } else {
        setError(insertError.message);
      }
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";
  const labelClass = "block text-body-sm text-ash mb-1.5";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-body-md text-muted">Loading...</p>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-confirmed/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-confirmed text-xl">✓</span>
          </div>
          <h1 className="font-display text-display-md mb-2">Applied</h1>
          <p className="text-body-md text-ash mb-6">
            Your application for <span className="text-ink font-medium">{production?.title}</span>{" "}
            has been submitted. You&apos;ll be notified when {orgName} responds.
          </p>
          <div className="space-y-3">
            <Link
              href={`/org/${slug}`}
              className="block w-full py-2.5 bg-ink text-paper text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors text-center"
            >
              Back to {orgName}
            </Link>
            <Link
              href="/directory"
              className="block w-full py-2.5 text-ash text-body-md hover:text-brick transition-colors text-center"
            >
              Browse more companies
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader back={{ href: `/org/${slug}`, label: orgName || "Back" }} />

      <div className="max-w-lg mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="font-display text-display-md mb-1">Apply</h1>
        <p className="text-body-md text-ash mb-8">
          <span className="text-ink">{production?.title}</span>
          {production?.playwright && <span> by {production.playwright}</span>}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
              {error}
            </div>
          )}

          {/* Application type */}
          {production && production.application_types.length > 1 && (
            <div>
              <label className={labelClass}>I&apos;m applying as</label>
              <div className="flex flex-wrap gap-2">
                {production.application_types.map((t: string) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-4 py-2 rounded-card text-body-sm border transition-colors ${
                      type === t
                        ? "bg-ink text-paper border-ink"
                        : "bg-card text-ash border-bone hover:border-ash"
                    }`}
                  >
                    {APPLICATION_TYPES[t] || t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Department */}
          <div>
            <label className={labelClass}>Department</label>
            <select
              value={departmentInterest}
              onChange={(e) => setDepartmentInterest(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Role interest */}
          <div>
            <label className={labelClass}>Role or position you&apos;re interested in</label>
            <input
              type="text"
              value={roleInterest}
              onChange={(e) => setRoleInterest(e.target.value)}
              placeholder={type === "audition" ? "e.g. Lead, Ensemble, any role" : "e.g. Lighting Designer, Sound Board Op"}
              className={inputClass}
            />
          </div>

          {/* Message */}
          <div>
            <label className={labelClass}>A note to the team</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you'd like the director or production team to know — experience, availability, questions"
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </div>
    </div>
  );
}
