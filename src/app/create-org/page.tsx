"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

const FIELD_OPTIONS = [
  { key: "emergency_contact", label: "Emergency contact", desc: "Name, phone, relationship" },
  { key: "allergies", label: "Allergies", desc: "Medical allergies or notes" },
  { key: "dietary_needs", label: "Dietary needs", desc: "Vegetarian, gluten-free, etc." },
  { key: "instagram_handle", label: "Instagram handle", desc: "Social media for promo" },
  { key: "shirt_size", label: "Shirt size", desc: "For merch or crew shirts" },
  { key: "transportation_notes", label: "Transportation", desc: "Ride needs or notes" },
  { key: "guardian_info", label: "Parent / Guardian", desc: "Required for minors" },
  { key: "availability_notes", label: "Availability & conflicts", desc: "Scheduling conflicts" },
  { key: "union_affiliation", label: "Union affiliation", desc: "AEA, SAG-AFTRA, etc." },
  { key: "agent_info", label: "Agent info", desc: "Agent name and contact" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export default function CreateOrgPage() {
  const router = useRouter();
  const [step, setStep] = useState<"info" | "fields">("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [requiredFields, setRequiredFields] = useState<string[]>(["emergency_contact", "availability_notes"]);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugEdited) setSlug(slugify(val));
  }

  function toggleField(key: string) {
    setRequiredFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: orgId, error: rpcError } = await supabase.rpc("create_org_with_owner", {
      org_name: name,
      org_slug: slug,
      org_city: city || null,
      org_state: state || null,
      org_description: description || null,
      org_website: website || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    // Update required fields (RPC doesn't handle this)
    if (requiredFields.length > 0) {
      await supabase
        .from("organizations")
        .update({ required_member_fields: requiredFields })
        .eq("id", orgId);
    }

    router.push("/home");
    router.refresh();
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors";
  const labelClass = "block text-body-sm text-ash mb-1.5";

  return (
    <div className="min-h-screen">
      <PublicHeader back={{ href: "/directory", label: "Directory" }} />

      <div className="max-w-md mx-auto px-4 md:px-8 py-8 md:py-12">
        {step === "info" ? (
          <>
            <h1 className="font-display text-display-md text-center mb-2">
              Create an organization
            </h1>
            <p className="text-body-md text-ash text-center mb-8">
              Set up your theatre company on Calltime.
            </p>

            <div className="space-y-4">
              {error && (
                <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
                  {error}
                </div>
              )}

              <div>
                <label className={labelClass}>Company name <span className="text-brick">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="e.g. Black Theatre Experience"
                />
              </div>

              <div>
                <label className={labelClass}>URL slug</label>
                <div className="flex items-center gap-0">
                  <span className="text-body-sm text-muted bg-bone/30 border border-bone border-r-0 rounded-l-card px-3 py-2.5">
                    checkcalltime.art/org/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }}
                    className={`${inputClass} rounded-l-none`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass}
                    placeholder="Lafayette"
                  />
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What your company does — a sentence or two"
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={labelClass}>Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputClass}
                  placeholder="https://yourcompany.org"
                />
              </div>

              <button
                onClick={() => setStep("fields")}
                disabled={!name.trim() || !slug.trim()}
                className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                Next: member fields
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-display-md text-center mb-2">
              What do you need from members?
            </h1>
            <p className="text-body-md text-ash text-center mb-8">
              Select the fields your company requires. Members fill these out after you approve their application.
            </p>

            <div className="space-y-2 mb-8">
              {FIELD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleField(opt.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-card border transition-colors text-left ${
                    requiredFields.includes(opt.key)
                      ? "border-ink bg-ink/[0.03]"
                      : "border-bone hover:border-ash"
                  }`}
                >
                  <span className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 text-xs ${
                    requiredFields.includes(opt.key)
                      ? "bg-ink border-ink text-paper"
                      : "border-bone"
                  }`}>
                    {requiredFields.includes(opt.key) ? "✓" : ""}
                  </span>
                  <div>
                    <p className="text-body-sm text-ink font-medium">{opt.label}</p>
                    <p className="text-body-xs text-muted">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("info")}
                className="px-5 py-2.5 bg-card border border-bone text-ash text-body-md rounded-card hover:border-ash transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create organization"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
