"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  function handleNameChange(name: string) {
    setOrgName(name);
    setOrgSlug(generateSlug(name));
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // Use the bootstrap function that handles the chicken-and-egg problem
    const { data, error: rpcError } = await supabase.rpc("create_org_with_owner", {
      org_name: orgName,
      org_slug: orgSlug,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  if (mode === "choose") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <h1 className="font-display text-display-md text-center mb-2">
            Set up your company
          </h1>
          <p className="text-body-md text-ash text-center mb-10">
            A company in Calltime is your theatre organization — the producing entity.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full text-left px-5 py-4 bg-card border border-bone rounded-card hover:border-ash hover:shadow-card transition-all group"
            >
              <span className="block text-body-md font-medium text-ink">
                Create a new organization
              </span>
              <span className="block text-body-sm text-ash mt-0.5">
                You&rsquo;re setting up Calltime for your theatre company.
              </span>
            </button>

            <div className="w-full text-left px-5 py-4 bg-card border border-bone rounded-card opacity-50">
              <span className="block text-body-md font-medium text-ink">
                Join an existing organization
              </span>
              <span className="block text-body-sm text-ash mt-0.5">
                You&rsquo;ve been invited. Check your email for a link.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="font-display text-display-md text-center mb-2">
          Create your organization
        </h1>
        <p className="text-body-md text-ash text-center mb-10">
          This is the theatre company that will produce work through Calltime.
        </p>

        <form onSubmit={handleCreateOrg} className="space-y-4">
          {error && (
            <div className="text-body-sm text-brick bg-brick/5 border border-brick/20 rounded-card px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="org_name" className="block text-body-sm text-ash mb-1.5">
              Organization name
            </label>
            <input
              id="org_name"
              type="text"
              value={orgName}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              placeholder="Heritage Parc / Black Theatre Experience"
            />
          </div>

          <div>
            <label htmlFor="org_slug" className="block text-body-sm text-ash mb-1.5">
              URL slug
            </label>
            <div className="flex items-center">
              <span className="text-body-sm text-muted mr-1 shrink-0">calltime.creativereach.art/</span>
              <input
                id="org_slug"
                type="text"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                required
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2.5 bg-card border border-bone rounded-card font-mono text-data-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="px-4 py-2.5 text-body-md text-ash hover:text-ink transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !orgName || !orgSlug}
              className="flex-1 py-2.5 bg-ink text-paper font-body text-body-md font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
