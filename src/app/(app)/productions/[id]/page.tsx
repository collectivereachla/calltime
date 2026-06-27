import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AddPersonForm } from "./add-person-form";
import { OpenCallCard } from "./open-call-card";
import { DirectorLetter } from "./director-letter";
import { AuditionsCard } from "./auditions-card";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { personId } = await getViewer(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get production with org info
  const { data: production } = await supabase
    .from("productions")
    .select(`
      id,
      title,
      playwright,
      venue,
      first_rehearsal,
      opening_date,
      closing_date,
      status,
      has_music,
      has_choreography,
      accepting_applications,
      application_types,
      open_call_description,
      open_call_deadline,
      organizations (id, name, slug)
    `)
    .eq("id", id)
    .single();

  if (!production) notFound();

  const org = production.organizations as unknown as { id: string; name: string; slug: string };

  // Get assignments for this production
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select(`
      id,
      role_title,
      department,
      access_tier,
      casting_structure,
      active,
      people (id, full_name, preferred_name, pronouns, email, phone)
    `)
    .eq("production_id", id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  // Check if current user is director or admin
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId!)
    .single();

  const userAssignment = assignments?.find(
    (a) => {
      const p = a.people as unknown as { id: string };
      return p.id === person?.id;
    }
  );

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("person_id", person!.id)
    .eq("org_id", org.id)
    .single();

  const canManage =
    membership?.role === "owner" ||
    membership?.role === "production";

  // Pending open-call applications awaiting review (owner/production only).
  let pendingApplications = 0;
  if (canManage) {
    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("production_id", id)
      .eq("status", "submitted");
    pendingApplications = count || 0;
  }

  // Director's letter (CRE-23): leadership sees draft+published; members see published only (RLS).
  const { data: letterRow } = await supabase
    .from("director_letters")
    .select("id, title, body, published")
    .eq("production_id", id)
    .maybeSingle();
  const assignedCount = assignments?.length || 0;
  let letterReadCount = 0;
  if (canManage && letterRow?.id) {
    const { count: rc } = await supabase
      .from("director_letter_reads")
      .select("id", { count: "exact", head: true })
      .eq("letter_id", letterRow.id);
    letterReadCount = rc || 0;
  }

  // Audition slots + signups (CRE-45), leadership view.
  type AudSlot = { id: string; starts_at: string; duration_min: number; location: string | null; capacity: number; notes: string | null; signups: { person_id: string; name: string }[] };
  let auditionSlots: AudSlot[] = [];
  if (canManage) {
    const { data: slots } = await supabase
      .from("audition_slots")
      .select("id, starts_at, duration_min, location, capacity, notes")
      .eq("production_id", id)
      .order("starts_at", { ascending: true });
    const slotIds = (slots || []).map((sl) => sl.id as string);
    const signupsBySlot = new Map<string, { person_id: string; name: string }[]>();
    if (slotIds.length > 0) {
      const { data: sus } = await supabase
        .from("audition_signups")
        .select("slot_id, person_id, people(full_name, preferred_name)")
        .in("slot_id", slotIds);
      for (const su of sus || []) {
        const pp = su.people as unknown as { full_name: string; preferred_name: string | null } | null;
        const arr = signupsBySlot.get(su.slot_id as string) || [];
        arr.push({ person_id: su.person_id as string, name: pp?.preferred_name || pp?.full_name || "—" });
        signupsBySlot.set(su.slot_id as string, arr);
      }
    }
    auditionSlots = (slots || []).map((sl) => ({
      id: sl.id as string,
      starts_at: sl.starts_at as string,
      duration_min: sl.duration_min as number,
      location: (sl.location as string | null) ?? null,
      capacity: sl.capacity as number,
      notes: (sl.notes as string | null) ?? null,
      signups: signupsBySlot.get(sl.id as string) || [],
    }));
  }

  // Group assignments by department
  const departments = new Map<string, typeof assignments>();
  assignments?.forEach((a) => {
    const dept = a.department || "other";
    if (!departments.has(dept)) departments.set(dept, []);
    departments.get(dept)!.push(a);
  });

  const deptOrder = [
    "directing",
    "stage_management",
    "cast",
    "design",
    "crew",
    "music",
    "production",
    "marketing",
  ];

  // Get all org members for the member picker (exclude already assigned)
  const { data: orgMembersRaw } = await supabase
    .from("org_memberships")
    .select("person_id, people(id, full_name, preferred_name, email, phone)")
    .eq("org_id", org.id)
    .eq("status", "active");

  const assignedPersonIds = new Set(assignments?.map(a => (a.people as unknown as { id: string }).id) || []);
  const orgMembers = (orgMembersRaw || [])
    .filter(m => m.people && !assignedPersonIds.has((m.people as unknown as { id: string }).id))
    .map(m => {
      const p = m.people as unknown as { id: string; full_name: string; preferred_name: string | null; email: string | null; phone: string | null };
      return { person_id: p.id, name: p.preferred_name || p.full_name, full_name: p.full_name, email: p.email, phone: p.phone };
    });

  const deptLabels: Record<string, string> = {
    directing: "Directing",
    stage_management: "Stage Management",
    cast: "Cast",
    design: "Design",
    crew: "Crew",
    music: "Music",
    production: "Production",
    marketing: "Marketing",
    other: "Other",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/home"
          className="text-body-sm text-ash hover:text-brick transition-colors"
        >
          &larr; Home
        </Link>
        <div className="mt-3">
          <h1 className="font-display text-display-lg text-ink">
            {production.title}
          </h1>
          {production.playwright && (
            <p className="text-body-md text-ash mt-0.5">
              by {production.playwright}
            </p>
          )}
          <p className="text-body-sm text-muted mt-1">
            {org.name}
            {production.venue && <> &middot; {production.venue}</>}
          </p>
        </div>
      </div>

      {/* Dates bar */}
      {(production.first_rehearsal || production.opening_date || production.closing_date) && (
        <div className="flex gap-8 mb-8 pb-6 border-b border-bone">
          {production.first_rehearsal && (
            <div>
              <p className="text-body-xs text-muted">First rehearsal</p>
              <p className="font-mono text-data-md text-ink">
                {new Date(production.first_rehearsal + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {production.opening_date && (
            <div>
              <p className="text-body-xs text-muted">Opening</p>
              <p className="font-mono text-data-md text-ink">
                {new Date(production.opening_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {production.closing_date && (
            <div>
              <p className="text-body-xs text-muted">Closing</p>
              <p className="font-mono text-data-md text-ink">
                {new Date(production.closing_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          <div>
            <p className="text-body-xs text-muted">Status</p>
            <p className="font-mono text-data-md text-ink">
              {production.status.replace(/_/g, " ")}
            </p>
          </div>
        </div>
      )}

      {/* Director's letter (CRE-23) */}
      <DirectorLetter
        productionId={id}
        canManage={canManage}
        letter={letterRow ? { id: letterRow.id, title: letterRow.title, body: letterRow.body, published: letterRow.published } : null}
        readCount={letterReadCount}
        assignedCount={assignedCount}
      />

      {/* Company (assignments) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-display-sm text-ink">Company</h2>
          <span className="text-body-xs text-muted">
            {assignments?.length || 0} assigned
          </span>
        </div>

        {(!assignments || assignments.length === 0) ? (
          <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
            <p className="text-body-md text-ash">No one assigned yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {deptOrder.filter((d) => departments.has(d)).map((dept) => (
              <div key={dept}>
                <h3 className="text-body-xs text-muted uppercase tracking-wider mb-2">
                  {deptLabels[dept]}
                </h3>
                <div className="bg-card border border-bone rounded-card divide-y divide-bone">
                  {departments.get(dept)!.map((assignment) => {
                    const p = assignment.people as unknown as {
                      id: string;
                      full_name: string;
                      preferred_name: string | null;
                      pronouns: string | null;
                      email: string | null;
                      phone: string | null;
                    };
                    return (
                      <div key={assignment.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <span className="text-body-md text-ink font-medium">
                            {p.preferred_name || p.full_name}
                          </span>
                          {p.pronouns && (
                            <span className="text-body-xs text-muted ml-1.5">{p.pronouns}</span>
                          )}
                          <span className="text-body-sm text-ash ml-3">
                            {assignment.role_title}
                          </span>
                        </div>
                        {assignment.casting_structure && (
                          <span className="text-body-xs text-muted font-mono">
                            {assignment.casting_structure.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add person form — only for directors/admins */}
      {canManage && (
        <AddPersonForm productionId={id} orgMembers={orgMembers} />
      )}

      {/* Open Call (auditions/applications) — owner/production only */}
      {canManage && (
        <OpenCallCard
          productionId={id}
          slug={org.slug}
          accepting={!!production.accepting_applications}
          types={(production.application_types as string[]) || []}
          description={production.open_call_description as string | null}
          deadline={production.open_call_deadline as string | null}
          pendingCount={pendingApplications}
        />
      )}

      {/* Auditions (CRE-45) — owner/production only */}
      {canManage && <AuditionsCard productionId={id} slots={auditionSlots} />}
    </div>
  );
}
