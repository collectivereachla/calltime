import { createClient } from "@/lib/supabase/server";
import { resolveHeadshot } from "@/lib/headshot";
import { resolveActingOrgId, canLeadOrgShows } from "@/lib/membership";
import { getViewer } from "@/lib/viewer";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EditProfile } from "./edit-profile";
import { MergeDuplicate } from "./merge-duplicate";
import { W9Download } from "./w9-download";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatBirthday(month: number | null, day: number | null): string | null {
  if (!month || !day) return null;
  return `${MONTHS[month]} ${day}`;
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const supabase = await createClient();

  const { personId: meId } = await getViewer(supabase);

  const { data: viewer } = await supabase
    .from("people")
    .select("id")
    .eq("id", meId!)
    .single();

  const actingOrgId = await resolveActingOrgId(viewer!.id);
  const { data: viewerMembership } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("person_id", viewer!.id)
    .eq("org_id", actingOrgId ?? "")
    .maybeSingle();

  if (!viewerMembership) return notFound();

  const isStaff = viewerMembership.role === "owner" || viewerMembership.role === "production" || (await canLeadOrgShows(viewer!.id, actingOrgId));
  const isSelf = viewer!.id === personId;

  // Fetch the person (must be in same org)
  const { data: targetMembership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", viewerMembership.org_id)
    .eq("person_id", personId)
    .single();

  if (!targetMembership) return notFound();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, pronouns, email, phone, headshot_url, bio, birth_month, birth_day, is_minor, user_id")
    .eq("id", personId)
    .single();

  if (!person) return notFound();

  // Sign the headshot path so the image loads (private bucket).
  const signedHeadshot = await resolveHeadshot(supabase, person.headshot_url);

  // Minor gating on contact info
  const hideContact = person.is_minor && !isStaff && !isSelf;
  const displayEmail = hideContact ? null : person.email;
  const displayPhone = hideContact ? null : person.phone;

  // Fetch private details (only if staff or self — RLS enforces this too)
  let details: {
    birth_year: number | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    allergies: string | null;
    dietary_needs: string | null;
    measurements: Record<string, string> | null;
    w9_submitted: boolean;
    w9_submitted_at: string | null;
    w9_document_path: string | null;
    w9_tax_year: number | null;
  } | null = null;

  if (isStaff || isSelf) {
    const { data } = await supabase
      .from("member_details")
      .select("birth_year, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, allergies, dietary_needs, measurements, w9_submitted, w9_submitted_at, w9_document_path, w9_tax_year")
      .eq("person_id", personId)
      .single();
    details = data;
  }

  // Fetch production assignments
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("role_title, department, productions(title)")
    .eq("person_id", personId)
    .eq("active", true);

  const roles = (assignments || []).map((a) => ({
    role: a.role_title,
    department: a.department,
    production: (a.productions as unknown as { title: string })?.title,
  }));

  const displayName = person.preferred_name || person.full_name;
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const birthday = formatBirthday(person.birth_month, person.birth_day);

  // Compute full DOB if staff/self and birth_year exists
  const fullDob = (isStaff || isSelf) && details?.birth_year && person.birth_month && person.birth_day
    ? `${MONTHS[person.birth_month]} ${person.birth_day}, ${details.birth_year}`
    : null;

  // Compute age
  const age = (isStaff || isSelf) && details?.birth_year && person.birth_month && person.birth_day
    ? (() => {
        const today = new Date();
        const birth = new Date(details!.birth_year!, person.birth_month! - 1, person.birth_day!);
        let a = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
        return a;
      })()
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Back */}
      <Link
        href="/company"
        className="inline-flex items-center gap-1 text-body-sm text-ash hover:text-ink transition-colors mb-6"
      >
        ← Company
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        {signedHeadshot ? (
          <img src={signedHeadshot} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-brick/10 text-brick flex items-center justify-center text-body-md font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div>
          <h1 className="font-display text-display-sm text-ink">{displayName}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            {person.preferred_name && person.preferred_name !== person.full_name && (
              <span className="text-body-sm text-muted">{person.full_name}</span>
            )}
            {person.pronouns && (
              <span className="text-body-sm text-muted">{person.pronouns}</span>
            )}
            <span className={`text-body-xs px-1.5 py-0.5 rounded ${
              targetMembership.role === "owner" ? "bg-brick/10 text-brick" :
              targetMembership.role === "production" ? "bg-confirmed/10 text-confirmed" :
              "bg-ink/5 text-ash"
            }`}>
              {targetMembership.role}
            </span>
            {person.is_minor && (
              <span className="text-body-xs px-1.5 py-0.5 rounded bg-tentative/10 text-tentative">
                minor
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Roles */}
      {roles.length > 0 && (
        <div className="mb-6">
          {roles.map((r, i) => (
            <p key={i} className="text-body-md text-ash">
              <span className="font-medium text-ink">{r.role}</span>
              {r.department && <span className="text-muted"> · {r.department}</span>}
              {r.production && <span className="text-muted"> in </span>}
              {r.production && <span className="font-display italic">{r.production}</span>}
            </p>
          ))}
        </div>
      )}

      {/* Bio */}
      {person.bio && (
        <div className="mb-6">
          <p className="text-body-md text-ink leading-relaxed">{person.bio}</p>
        </div>
      )}

      {/* Public info */}
      <div className="bg-card border border-bone rounded-card divide-y divide-bone mb-6">
        {displayEmail && (
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-body-xs text-muted uppercase tracking-wider">Email</span>
            <a href={`mailto:${displayEmail}`} className="text-body-sm text-ink hover:text-brick transition-colors">
              {displayEmail}
            </a>
          </div>
        )}
        {displayPhone && (
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-body-xs text-muted uppercase tracking-wider">Phone</span>
            <a href={`tel:${displayPhone}`} className="font-mono text-data-sm text-ink hover:text-brick transition-colors">
              {displayPhone}
            </a>
          </div>
        )}
        {birthday && (
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-body-xs text-muted uppercase tracking-wider">Birthday</span>
            <span className="text-body-sm text-ink">
              {(isStaff || isSelf) && fullDob ? `${fullDob} (age ${age})` : birthday}
            </span>
          </div>
        )}
        {hideContact && (
          <div className="px-5 py-3">
            <p className="text-body-xs text-muted italic">
              Contact info hidden — this member is a minor.
            </p>
          </div>
        )}
      </div>

      {/* Private details — staff or self only */}
      {(isStaff || isSelf) && details && (
        <div className="space-y-6">
          <div>
            <h2 className="text-body-xs text-muted uppercase tracking-wider mb-3">
              {isStaff && !isSelf ? "Private — staff only" : "Your private info"}
            </h2>
            <div className="bg-card border border-bone rounded-card divide-y divide-bone">
              <div className="px-5 py-3">
                <span className="text-body-xs text-muted uppercase tracking-wider block mb-1">Emergency contact</span>
                {details.emergency_contact_name ? (
                  <div>
                    <span className="text-body-sm text-ink font-medium">{details.emergency_contact_name}</span>
                    {details.emergency_contact_relationship && (
                      <span className="text-body-sm text-muted"> ({details.emergency_contact_relationship})</span>
                    )}
                    {details.emergency_contact_phone && (
                      <a href={`tel:${details.emergency_contact_phone}`} className="block font-mono text-data-sm text-ash hover:text-brick transition-colors mt-0.5">
                        {details.emergency_contact_phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="text-body-sm text-muted italic">Not provided</span>
                )}
              </div>

              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-body-xs text-muted uppercase tracking-wider">Allergies</span>
                <span className="text-body-sm text-ink">
                  {details.allergies || <span className="text-muted italic">None listed</span>}
                </span>
              </div>

              {details.dietary_needs && (
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-body-xs text-muted uppercase tracking-wider">Dietary needs</span>
                  <span className="text-body-sm text-ink">{details.dietary_needs}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* W-9 — finance only, locked download */}
      {isStaff && details?.w9_document_path && (
        <W9Download path={details.w9_document_path} taxYear={details.w9_tax_year} submittedAt={details.w9_submitted_at} />
      )}

      {/* Edit profile — self or staff */}
      {(isStaff || isSelf) && (
        <EditProfile
          personId={personId}
          orgId={viewerMembership.org_id}
          isSelf={isSelf}
          isStaff={isStaff}
          current={{
            bio: person.bio,
            headshot_url: person.headshot_url,
            birth_month: person.birth_month,
            birth_day: person.birth_day,
          }}
          details={details ? {
            birth_year: details.birth_year,
            emergency_contact_name: details.emergency_contact_name,
            emergency_contact_phone: details.emergency_contact_phone,
            emergency_contact_relationship: details.emergency_contact_relationship,
            allergies: details.allergies,
            dietary_needs: details.dietary_needs,
            w9_submitted: details.w9_submitted,
            w9_submitted_at: details.w9_submitted_at,
          } : null}
        />
      )}

      {/* Merge a duplicate person — owners only */}
      {viewerMembership.role === "owner" && (
        <div className="mt-2">
          <MergeDuplicate
            keepId={person.id}
            keepName={person.preferred_name || person.full_name}
            keepEmail={person.email}
            keepUserId={(person as { user_id: string | null }).user_id}
          />
        </div>
      )}
    </div>
  );
}
