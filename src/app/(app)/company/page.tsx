import { createClient } from "@/lib/supabase/server";
import { EditMemberButton } from "./edit-member";

export default async function CompanyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(id, name)")
    .eq("person_id", person!.id)
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const org = membership.organizations as unknown as { id: string; name: string };
  const canManage = membership.role === "owner" || membership.role === "production";

  // Get all members with their org role
  const { data: members } = await supabase
    .from("org_memberships")
    .select(`
      id,
      role,
      people (
        id,
        full_name,
        preferred_name,
        email,
        phone,
        pronouns,
        headshot_url
      )
    `)
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  // Get productions with assignments (including assignment IDs for editing)
  const { data: productions } = await supabase
    .from("productions")
    .select(`
      id,
      title,
      status,
      opening_date,
      production_assignments (
        id,
        person_id,
        role_title,
        department,
        access_tier,
        casting_structure,
        active
      )
    `)
    .eq("org_id", org.id)
    .neq("status", "archived")
    .order("opening_date", { ascending: true });

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-display-md text-ink">Company</h1>
          <p className="text-body-md text-ash mt-1">
            {org.name} &middot; {members?.length || 0} member{members?.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && (
          <span className="text-body-xs text-muted bg-bone/50 px-2 py-0.5 rounded">
            {membership.role}
          </span>
        )}
      </div>

      {!members || members.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No members yet.</p>
        </div>
      ) : (
        <div className="bg-card border border-bone rounded-card divide-y divide-bone">
          {[...members].filter((m) => m.people != null).sort((a, b) => {
            // Sort: owner first, then production, then by SM status, then alphabetical
            const roleOrder: Record<string, number> = { owner: 0, production: 1, member: 2, guest: 3 };
            const aOrder = roleOrder[a.role] ?? 2;
            const bOrder = roleOrder[b.role] ?? 2;
            if (aOrder !== bOrder) return aOrder - bOrder;

            // Within same org role, check if SM (from assignments)
            const aIsSM = productions?.some((prod) =>
              (prod.production_assignments as unknown as { person_id: string; role_title: string; active: boolean }[])
                .some((pa) => pa.person_id === (a.people as unknown as { id: string }).id && pa.active && pa.role_title.toLowerCase().includes("stage manager"))
            );
            const bIsSM = productions?.some((prod) =>
              (prod.production_assignments as unknown as { person_id: string; role_title: string; active: boolean }[])
                .some((pa) => pa.person_id === (b.people as unknown as { id: string }).id && pa.active && pa.role_title.toLowerCase().includes("stage manager"))
            );
            if (aIsSM && !bIsSM) return -1;
            if (!aIsSM && bIsSM) return 1;

            // Alphabetical by display name
            const aName = (a.people as unknown as { preferred_name: string | null; full_name: string }).preferred_name || (a.people as unknown as { full_name: string }).full_name;
            const bName = (b.people as unknown as { preferred_name: string | null; full_name: string }).preferred_name || (b.people as unknown as { full_name: string }).full_name;
            return aName.localeCompare(bName);
          }).map((member) => {
            const p = member.people as unknown as {
              id: string;
              full_name: string;
              preferred_name: string | null;
              email: string | null;
              phone: string | null;
              pronouns: string | null;
              headshot_url: string | null;
            };

            // Find this person's active assignments with full details
            const personAssignments = productions
              ?.flatMap((prod) => {
                const assignments = (
                  prod.production_assignments as unknown as {
                    id: string;
                    person_id: string;
                    role_title: string;
                    department: string | null;
                    access_tier: string;
                    casting_structure: string | null;
                    active: boolean;
                  }[]
                ).filter((a) => a.person_id === p.id && a.active);

                return assignments.map((a) => ({
                  id: a.id,
                  role_title: a.role_title,
                  department: a.department,
                  access_tier: a.access_tier,
                  casting_structure: a.casting_structure,
                  production_title: prod.title,
                }));
              })
              .filter(Boolean) || [];

            const isCurrentUser = p.id === person!.id;
            const initials = (p.preferred_name || p.full_name).split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

            return (
              <div key={member.id} className="px-4 md:px-6 py-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                  <div className="flex gap-3 min-w-0">
                    {p.headshot_url ? (
                      <img src={p.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brick/10 text-brick flex items-center justify-center text-body-xs font-medium shrink-0 mt-0.5">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="text-body-md font-medium text-ink">
                        {p.preferred_name || p.full_name}
                      </h3>
                      {p.preferred_name && p.preferred_name !== p.full_name && (
                        <span className="text-body-xs text-muted">
                          ({p.full_name})
                        </span>
                      )}
                      {p.pronouns && (
                        <span className="text-body-xs text-muted">
                          {p.pronouns}
                        </span>
                      )}
                      <span className={`text-body-xs px-1.5 py-0.5 rounded ${
                        member.role === "owner" ? "bg-brick/10 text-brick" :
                        member.role === "production" ? "bg-confirmed/10 text-confirmed" :
                        member.role === "guest" ? "bg-ash/10 text-ash" :
                        "bg-ink/5 text-ash"
                      }`}>
                        {member.role}
                      </span>
                    </div>

                    {personAssignments.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1.5">
                        {personAssignments.map((a, i) => (
                          <span key={i} className="text-body-sm text-ash">
                            <span className="font-medium text-ink">{a.role_title}</span>
                            <span className="text-muted"> in </span>
                            <span className="font-display italic">{a.production_title}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Contact info — inline on mobile */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 md:hidden">
                      {p.email && <a href={`mailto:${p.email}`} className="text-body-xs text-ash hover:text-brick transition-colors">{p.email}</a>}
                      {p.phone && <a href={`tel:${p.phone}`} className="font-mono text-data-sm text-ash hover:text-brick transition-colors">{p.phone}</a>}
                    </div>
                  </div>
                  </div>

                  <div className="flex items-start gap-3 shrink-0">
                    {/* Contact info — right side on desktop */}
                    <div className="text-right hidden md:block">
                      {p.email && <a href={`mailto:${p.email}`} className="block text-body-xs text-ash hover:text-brick transition-colors">{p.email}</a>}
                      {p.phone && <a href={`tel:${p.phone}`} className="block font-mono text-data-sm text-ash hover:text-brick transition-colors">{p.phone}</a>}
                    </div>
                    {canManage && (
                      <EditMemberButton
                        person={p}
                        orgId={org.id}
                        orgRole={member.role}
                        assignments={personAssignments}
                        productions={(productions || []).map((prod) => ({
                          id: prod.id,
                          title: prod.title,
                        }))}
                        isCurrentUser={isCurrentUser}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
