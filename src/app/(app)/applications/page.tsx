import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import { ApplicationReview } from "./application-review";
import { getActiveProductionId } from "@/lib/active-production";
import { orgIdForProduction, getRoleInOrg, isLeadershipRole, canLeadProduction } from "@/lib/membership";

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId!)
    .single();

  if (!person) redirect("/onboarding");

  // Applications live per production. Scope to the SELECTED show and confirm
  // the viewer leads the org that owns it. The old query pulled every owner/
  // admin org's applications at once (leaking TJS into the Banquet) and checked
  // a stale "admin" role that no longer exists (it's "production" now).
  const activeProductionId = await getActiveProductionId();
  if (!activeProductionId) redirect("/home");

  const orgId = await orgIdForProduction(activeProductionId);
  if (!orgId) redirect("/home");

  if (!isLeadershipRole(await getRoleInOrg(person.id, orgId)) && !(await canLeadProduction(person.id, activeProductionId))) {
    redirect("/home");
  }

  // Fetch applications for THIS production only
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, type, department_interest, role_interest, message, status,
      created_at, assigned_role, assigned_access_tier,
      people:person_id (id, full_name, preferred_name, email, phone, bio, headshot_url, pronouns),
      productions:production_id (id, title, org_id)
    `)
    .eq("production_id", activeProductionId)
    .order("created_at", { ascending: false });

  const filtered = applications || [];

  const pending = filtered.filter((a) => a.status === "submitted");
  const processed = filtered.filter((a) => a.status !== "submitted");

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-24">
      <h1 className="font-display text-display-md mb-1">Applications</h1>
      <p className="text-body-md text-ash mb-8">
        {pending.length} pending · {processed.length} processed
      </p>

      {pending.length === 0 && processed.length === 0 && (
        <div className="text-center py-16">
          <p className="text-body-md text-muted">No applications yet.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-12">
          <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">
            Pending review
          </h2>
          <div className="space-y-4">
            {pending.map((app) => {
              const person = app.people as unknown as {
                id: string; full_name: string; preferred_name: string | null;
                email: string; phone: string | null; bio: string | null;
                headshot_url: string | null; pronouns: string | null;
              } | null;
              const prod = app.productions as unknown as { id: string; title: string } | null;
              if (!person || !prod) return null;
              return (
                <ApplicationReview
                  key={app.id}
                  personId={person.id}
                  application={{
                    id: app.id,
                    type: app.type,
                    departmentInterest: app.department_interest,
                    roleInterest: app.role_interest,
                    message: app.message,
                    createdAt: app.created_at,
                  }}
                  person={{
                    name: person.preferred_name || person.full_name,
                    fullName: person.full_name,
                    email: person.email,
                    phone: person.phone,
                    bio: person.bio,
                    headshotUrl: person.headshot_url,
                    pronouns: person.pronouns,
                  }}
                  production={{ id: prod.id, title: prod.title }}
                />
              );
            })}
          </div>
        </div>
      )}

      {processed.length > 0 && (
        <div>
          <h2 className="text-body-xs text-muted uppercase tracking-wider mb-4">
            Processed
          </h2>
          <div className="space-y-2">
            {processed.map((app) => {
              const person = app.people as unknown as {
                full_name: string; preferred_name: string | null;
              } | null;
              const prod = app.productions as unknown as { title: string } | null;
              if (!person || !prod) return null;
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between py-3 border-b border-bone/50 last:border-0"
                >
                  <div>
                    <span className="text-body-md text-ink">
                      {person.preferred_name || person.full_name}
                    </span>
                    <span className="text-body-sm text-muted ml-2">
                      {prod.title} · {app.type}
                    </span>
                    {app.assigned_role && (
                      <span className="text-body-sm text-ash ml-2">
                        → {app.assigned_role}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-body-xs px-2 py-0.5 rounded-full ${
                      app.status === "accepted"
                        ? "bg-confirmed/10 text-confirmed"
                        : "bg-brick/10 text-brick"
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
