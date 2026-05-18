"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// Maps required_member_fields keys to form field definitions
const FIELD_MAP: Record<string, { label: string; fields: FieldDef[] }> = {
  emergency_contact: {
    label: "Emergency contact",
    fields: [
      { key: "emergency_contact_name", label: "Name", type: "text", placeholder: "Full name" },
      { key: "emergency_contact_phone", label: "Phone", type: "tel", placeholder: "(555) 555-5555" },
      { key: "emergency_contact_relationship", label: "Relationship", type: "text", placeholder: "e.g. Mother, Partner" },
    ],
  },
  allergies: {
    label: "Allergies",
    fields: [
      { key: "allergies", label: "Allergies or medical notes", type: "text", placeholder: "List any allergies, or write 'None'" },
    ],
  },
  dietary_needs: {
    label: "Dietary needs",
    fields: [
      { key: "dietary_needs", label: "Dietary needs", type: "text", placeholder: "e.g. Vegetarian, gluten-free, none" },
    ],
  },
  instagram_handle: {
    label: "Instagram",
    fields: [
      { key: "instagram_handle", label: "Instagram handle", type: "text", placeholder: "@yourhandle" },
    ],
  },
  shirt_size: {
    label: "Shirt size",
    fields: [
      { key: "shirt_size", label: "Shirt size", type: "select", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
    ],
  },
  transportation_notes: {
    label: "Transportation",
    fields: [
      { key: "transportation_notes", label: "Transportation notes", type: "textarea", placeholder: "Do you have reliable transportation? Need a ride?" },
    ],
  },
  guardian_info: {
    label: "Parent / Guardian",
    fields: [
      { key: "guardian_name", label: "Guardian name", type: "text", placeholder: "Full name" },
      { key: "guardian_phone", label: "Guardian phone", type: "tel", placeholder: "(555) 555-5555" },
      { key: "guardian_email", label: "Guardian email", type: "email", placeholder: "email@example.com" },
    ],
  },
  availability_notes: {
    label: "Availability",
    fields: [
      { key: "availability_notes", label: "Availability & conflicts", type: "textarea", placeholder: "List any dates you're unavailable, work schedule conflicts, etc." },
    ],
  },
  union_affiliation: {
    label: "Union",
    fields: [
      { key: "union_affiliation", label: "Union affiliation", type: "text", placeholder: "e.g. AEA, SAG-AFTRA, or Non-union" },
    ],
  },
  agent_info: {
    label: "Agent",
    fields: [
      { key: "agent_name", label: "Agent name", type: "text", placeholder: "Full name" },
      { key: "agent_contact", label: "Agent contact", type: "text", placeholder: "Email or phone" },
    ],
  },
};

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "tel" | "email" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [personId, setPersonId] = useState("");
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: person } = await supabase
        .from("people")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!person) { router.push("/onboarding"); return; }
      setPersonId(person.id);

      // Get first active membership
      const { data: membership } = await supabase
        .from("org_memberships")
        .select("org_id, organizations(name, required_member_fields)")
        .eq("person_id", person.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!membership) { router.push("/directory"); return; }

      const org = membership.organizations as unknown as {
        name: string;
        required_member_fields: string[];
      };
      setOrgId(membership.org_id);
      setOrgName(org.name);
      setRequiredFields(org.required_member_fields || []);
      setLoading(false);
    }
    load();
  }, [router]);

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();

    // Build the insert object from form values
    const insert: Record<string, unknown> = {
      person_id: personId,
      org_id: orgId,
    };
    for (const [key, val] of Object.entries(values)) {
      if (val.trim()) insert[key] = val.trim();
    }

    const { error: insertError } = await supabase
      .from("member_details")
      .insert(insert);

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    router.push("/home");
    router.refresh();
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="font-display text-display-md text-center mb-2">
          Welcome to {orgName}
        </h1>
        <p className="text-body-md text-ash text-center mb-8">
          A few things {orgName} needs from you before you start.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
              {error}
            </div>
          )}

          {requiredFields.map((fieldKey) => {
            const group = FIELD_MAP[fieldKey];
            if (!group) return null;

            return (
              <div key={fieldKey}>
                {group.fields.length > 1 && (
                  <p className="text-body-xs text-muted uppercase tracking-wider mb-3">
                    {group.label}
                  </p>
                )}
                <div className={`space-y-3 ${group.fields.length > 1 ? "pl-0" : ""}`}>
                  {group.fields.map((field) => (
                    <div key={field.key}>
                      <label className={labelClass}>
                        {group.fields.length > 1 ? field.label : group.label}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={values[field.key] || ""}
                          onChange={(e) => updateValue(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                          required
                          className={`${inputClass} resize-none`}
                        />
                      ) : field.type === "select" ? (
                        <select
                          value={values[field.key] || ""}
                          onChange={(e) => updateValue(field.key, e.target.value)}
                          required
                          className={inputClass}
                        >
                          <option value="">Select</option>
                          {field.options?.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          value={values[field.key] || ""}
                          onChange={(e) => updateValue(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          required
                          className={inputClass}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : "Get started"}
          </button>
        </form>
      </div>
    </div>
  );
}
