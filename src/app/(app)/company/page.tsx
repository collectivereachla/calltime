import { createClient } from "@/lib/supabase/server";
import { EditMemberButton } from "./edit-member";
import Link from "next/link";

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
  const { data: rawMembers } = await supabase
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
        headshot_url,
        bio,
        birth_month,
        birth_day,
        is_minor
      )
    `)
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  // For staff: fetch member_details for completion tracking
  let detailsMap = new Map<string, { ec: boolean; allergies: boolean; birthday_full: boolean }>();
  if (canManage) {
    const personIds = (rawMembers || [])
      .map((m) => (m.people as unknown as { id: string })?.id)
      .filter(Boolean);
    if (personIds.length > 0) {
      const { data: allDetails } = await supabase
        .from("member_details")
        .select("person_id, emergency_contact_name, allergies, birth_year")
        .in("person_id", personIds);
      for (const d of allDetails || []) {
        detailsMap.set(d.person_id, {
          ec: !!d.emergency_contact_name,
          allergies: d.allergies !== null,
          birthday_full: !!d.birth_year,
        });
      }
    }
  }

  // Minor gating: null out email/phone for minors unless viewer is staff or self
  const members = (rawMembers || []).map((m) => {
    const p = m.people as unknown as {
      id: string; full_name: string; preferred_name: string | null;
      email: string | null; phone: string | null; pronouns: string | null;
      headshot_url: string | null; bio: string | null;
      birth_month: number | null; birth_day: number | null; is_minor: boolean;
    };
    if (!p) return m;
    const hideContact = p.is_minor && !canManage && p.id !== person!.id;
    return {
      ...m,
      people: {
        ...p,
        email: hideContact ? null : p.email,
        phone: hideContact ? null : p.phone,
      },
    };
  });

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

      {/* Staff completion dashboard */}
      {canManage && members.length > 0 && (() => {
        const total = members.filter((m) => m.people != null).length;
        const withPeople = members.filter((m) => m.people != null).map((m) => {
          const p = m.people as unknown as { id: string; headshot_url: string | null; bio: string | null; birth_month: number | null };
          const d = detailsMap.get(p.id);
          return {
            headshot: !!p.headshot_url,
            bio: !!p.bio,
            birthday: !!p.birth_month && !!d?.birthday_full,
            emergency: !!d?.ec,
          };
        });
        const counts = {
          headshot: withPeople.filter((p) => p.headshot).length,
          bio: withPeople.filter((p) => p.bio).length,
          birthday: withPeople.filter((p) => p.birthday).length,
          emergency: withPeople.filter((p) => p.emergency).length,
        };
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            {([
              { label: "Headshot", count: counts.headshot },
              { label: "Bio", count: counts.bio },
              { label: "Birthday", count: counts.birthday },
              { label: "Emergency", count: counts.emergency },
            ] as const).map((item) => (
              <div key={item.label} className="bg-card border border-bone rounded-card px-3 py-2.5 text-center">
                <p className={`font-mono text-data-md ${item.count === total ? "text-confirmed" : item.count === 0 ? "text-muted" : "text-tentative"}`}>
                  {item.count}/{total}
                </p>
                <p className="text-body-xs text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

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
              bio: string | null;
              birth_month: number | null;
              birth_day: number | null;
              is_minor: boolean;
            };
            const completion = canManage ? {
              headshot: !!p?.headshot_url,
              bio: !!p?.bio,
              birthday: !!p?.birth_month && !!detailsMap.get(p?.id)?.birthday_full,
              emergency: !!detailsMap.get(p?.id)?.ec,
            } : null;

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
                        <Link href={`/company/${p.id}`} className="hover:text-brick transition-colors">
                          {p.preferred_name || p.full_name}
                        </Link>
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
                      {completion && (
                        <span className="inline-flex gap-0.5 ml-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${completion.headshot ? "bg-confirmed" : "bg-bone"}`} title="Headshot" />
                          <span className={`w-1.5 h-1.5 rounded-full ${completion.bio ? "bg-confirmed" : "bg-bone"}`} title="Bio" />
                          <span className={`w-1.5 h-1.5 rounded-full ${completion.birthday ? "bg-confirmed" : "bg-bone"}`} title="Birthday" />
                          <span className={`w-1.5 h-1.5 rounded-full ${completion.emergency ? "bg-confirmed" : "bg-bone"}`} title="Emergency contact" />
                        </span>
                      )}
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
