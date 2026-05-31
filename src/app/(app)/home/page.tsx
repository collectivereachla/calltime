import { createClient } from "@/lib/supabase/server";
import { CalendarLink } from "@/components/calendar-link";
import { WhatChanged, type WhatChangedProduction } from "@/components/what-changed";
import { ShowLink } from "@/components/show-link";
import { ProductionHealth } from "./production-health";
import { WelcomeChecklist } from "./welcome-checklist";

type UpcomingCall = {
  event_id: string;
  event_call_id: string;
  event_title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  mandatory: boolean;
  production_id: string;
  production_title: string;
  org_id: string;
  org_name: string;
  response_status: string | null;
};

function fmtDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="text-body-xs font-medium px-2 py-1 rounded-full bg-brick/10 text-brick">
        Respond
      </span>
    );
  }
  const map: Record<string, { cls: string; label: string }> = {
    confirmed: { cls: "bg-confirmed/10 text-confirmed", label: "Confirmed ✓" },
    tentative: { cls: "bg-tentative/10 text-tentative", label: "Tentative ?" },
    conflict: { cls: "bg-conflict/10 text-conflict", label: "Conflict ✕" },
  };
  const s = map[status] || { cls: "bg-brick/10 text-brick", label: status };
  return (
    <span className={`text-body-xs font-medium px-2 py-1 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get person record
  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, calendar_token")
    .eq("user_id", user!.id)
    .single();

  // Every active production assignment for this person, across every org.
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select(`
      id,
      role_title,
      department,
      access_tier,
      active,
      productions (
        id,
        title,
        playwright,
        venue,
        status,
        first_rehearsal,
        opening_date,
        closing_date,
        organizations (
          id,
          name
        )
      )
    `)
    .eq("person_id", person!.id)
    .eq("active", true);

  const displayName = person?.preferred_name || person?.full_name || "there";

  type ProdInfo = {
    id: string; title: string; status: string;
    playwright: string | null; venue: string | null;
    first_rehearsal: string | null; opening_date: string | null;
    closing_date: string | null; organizations: { id: string; name: string };
  };

  // Memberships are a SET (a person may belong to many orgs). Never collapse to one.
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("role, org_id")
    .eq("person_id", person!.id);

  const ownerOrgIds = new Set(
    (memberships || [])
      .filter((m) => m.role === "owner" || m.role === "production")
      .map((m) => m.org_id)
  );
  const canCreate = ownerOrgIds.size > 0;

  // Deduplicate by production — aggregate role titles for multi-role people —
  // and compute, PER production, whether this viewer leads it (org owner/production,
  // or an SM / production-staff assignment on that very show).
  const prodMap = new Map<string, {
    role_titles: string[];
    canManage: boolean;
    productions: ProdInfo;
  }>();

  for (const a of assignments || []) {
    const prod = a.productions as unknown as ProdInfo | null;
    if (!prod) continue; // null-guard: RLS can hide the joined row
    if (prod.status === "archived" || prod.status === "closed") continue;
    const leadsThisShow =
      ownerOrgIds.has(prod.organizations?.id) ||
      a.department === "stage_management" ||
      ["admin", "production", "staff"].includes(a.access_tier);
    const existing = prodMap.get(prod.id);
    if (existing) {
      existing.role_titles.push(a.role_title);
      existing.canManage = existing.canManage || leadsThisShow;
    } else {
      prodMap.set(prod.id, {
        role_titles: [a.role_title],
        canManage: leadsThisShow,
        productions: prod,
      });
    }
  }

  const activeProductions = Array.from(prodMap.values())
    .sort((a, b) => (a.productions.opening_date || "").localeCompare(b.productions.opening_date || ""));

  const orgCount = new Set(activeProductions.map((p) => p.productions.organizations?.id)).size;

  const whatChangedProductions: WhatChangedProduction[] = activeProductions.map((p) => ({
    id: p.productions.id,
    title: p.productions.title,
    canManage: p.canManage,
  }));

  // All upcoming published calls for this person, across every show and org.
  const { data: upcomingData } = await supabase.rpc("get_upcoming_calls", {
    p_person_id: person!.id,
  });
  const upcoming = (upcomingData as unknown as UpcomingCall[]) || [];

  // Hero = the soonest call (any status). Needs-response = unanswered (minus hero).
  // Coming up = everything already responded to (minus hero). Disjoint by design.
  const hero = upcoming[0] || null;
  const rest = hero ? upcoming.slice(1) : upcoming;
  const needsResponse = rest.filter((c) => c.response_status == null);
  const comingUp = rest.filter((c) => c.response_status != null).slice(0, 8);

  // Pending contracts for this person (already person-scoped, all shows).
  const { data: pendingContracts } = await supabase
    .from("contracts")
    .select("id, role_title, compensation, contract_templates(title)")
    .eq("person_id", person!.id)
    .eq("status", "pending");

  const showOrgOnCalls = orgCount > 1;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Page header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-display text-display-md text-ink">{displayName}</h1>
          <p className="text-body-md text-ash mt-1">
            {activeProductions.length === 0
              ? "No active productions."
              : `${activeProductions.length} active production${activeProductions.length === 1 ? "" : "s"}${orgCount > 1 ? ` across ${orgCount} companies` : ""}`}
          </p>
        </div>
        {canCreate && (
          <a
            href="/home/new-production"
            className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors shrink-0"
          >
            New production
          </a>
        )}
      </div>

      {/* Welcome checklist for new users */}
      {activeProductions.length > 0 && (
        <WelcomeChecklist personId={person!.id} productionId={activeProductions[0].productions.id} />
      )}

      {/* Next call — the single soonest, any status */}
      {hero && (
        <div className="mb-8">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Next call</p>
          <ShowLink
            productionId={hero.production_id}
            href="/callboard"
            className="block bg-card border border-brick/20 rounded-card px-5 py-4 hover:shadow-card-hover transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-body-xs font-medium px-1.5 py-0.5 rounded bg-brick/10 text-brick">
                    {hero.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-body-xs text-muted">
                    {hero.production_title}
                    {showOrgOnCalls && ` · ${hero.org_name}`}
                  </span>
                </div>
                <h3 className="text-body-md font-medium text-ink">{hero.event_title}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-data-sm text-ink">
                    {fmtDate(hero.event_date)}
                    {hero.start_time && ` · ${fmtTime(hero.start_time)}`}
                  </span>
                  {hero.location && (
                    <span className="text-body-xs text-ash">{hero.location}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge status={hero.response_status} />
              </div>
            </div>
          </ShowLink>
        </div>
      )}

      {/* Needs your response — unanswered calls across all shows */}
      {needsResponse.length > 0 && (
        <div className="mb-8">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">
            Needs your response · {needsResponse.length}
          </p>
          <div className="space-y-2">
            {needsResponse.map((c) => (
              <ShowLink
                key={c.event_call_id}
                productionId={c.production_id}
                href="/callboard"
                className="block bg-card border border-brick/20 rounded-card px-5 py-3 hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-body-sm font-medium text-ink truncate">{c.event_title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-body-xs text-ash">
                        {fmtDate(c.event_date)}
                        {c.start_time && ` · ${fmtTime(c.start_time)}`}
                      </span>
                      <span className="text-body-xs text-muted truncate">
                        {c.production_title}
                        {showOrgOnCalls && ` · ${c.org_name}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-body-xs font-medium px-2 py-1 rounded-full bg-brick/10 text-brick shrink-0">
                    Respond
                  </span>
                </div>
              </ShowLink>
            ))}
          </div>
        </div>
      )}

      {/* Pending contracts */}
      {pendingContracts && pendingContracts.length > 0 && (
        <div className="mb-8">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Contracts</p>
          <a href="/ledger" className="block bg-card border border-brick/20 rounded-card px-5 py-4 hover:shadow-card-hover transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body-md font-medium text-ink">
                  {pendingContracts.length} contract{pendingContracts.length === 1 ? "" : "s"} awaiting your signature
                </h3>
                <div className="mt-2 space-y-1">
                  {pendingContracts.slice(0, 3).map((c) => (
                    <p key={c.id} className="text-body-xs text-ash">
                      {(c.contract_templates as unknown as { title: string })?.title} — {c.role_title}
                      {c.compensation && (
                        <span className="font-mono text-brick ml-1">{c.compensation}</span>
                      )}
                    </p>
                  ))}
                  {pendingContracts.length > 3 && (
                    <p className="text-body-xs text-muted">+{pendingContracts.length - 3} more</p>
                  )}
                </div>
              </div>
              <span className="text-body-xs font-medium px-2 py-1 rounded-full bg-brick/10 text-brick shrink-0">
                Sign now
              </span>
            </div>
          </a>
        </div>
      )}

      {/* Coming up — calls already responded to, your road ahead */}
      {comingUp.length > 0 && (
        <div className="mb-8">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-2">Coming up</p>
          <div className="space-y-2">
            {comingUp.map((c) => (
              <ShowLink
                key={c.event_call_id}
                productionId={c.production_id}
                href="/callboard"
                className="block bg-card border border-bone rounded-card px-5 py-3 hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-body-sm font-medium text-ink truncate">{c.event_title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-body-xs text-ash">
                        {fmtDate(c.event_date)}
                        {c.start_time && ` · ${fmtTime(c.start_time)}`}
                      </span>
                      <span className="text-body-xs text-muted truncate">
                        {c.production_title}
                        {showOrgOnCalls && ` · ${c.org_name}`}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={c.response_status} />
                  </div>
                </div>
              </ShowLink>
            ))}
          </div>
        </div>
      )}

      {/* What changed — across every show, leadership evaluated per show */}
      {activeProductions.length > 0 && (
        <div className="mb-8">
          <WhatChanged productions={whatChangedProductions} personId={person!.id} />
        </div>
      )}

      {/* Productions */}
      {activeProductions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <span className="text-3xl mb-3 opacity-40">🎭</span>
          <h3 className="font-display text-display-sm text-ink mb-2">Welcome to Calltime</h3>
          <p className="text-body-sm text-ash max-w-md leading-relaxed">
            {canCreate
              ? "You don't have any active productions yet. Create one to get started, or check your email for an invitation."
              : "When you're assigned to a production, your schedule, script, contract, and everything else will appear here. Check your email if you're expecting an invitation."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Your shows</p>
          {activeProductions.map((entry) => {
            const prod = entry.productions;
            return (
              <ShowLink
                productionId={prod.id}
                href={`/productions/${prod.id}`}
                key={prod.id}
                className="block bg-card border border-bone rounded-card px-6 py-5 hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-display-sm text-ink">{prod.title}</h2>
                    {prod.playwright && (
                      <p className="text-body-sm text-ash mt-0.5">by {prod.playwright}</p>
                    )}
                    <p className="text-body-sm text-ash mt-1">{prod.organizations?.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block text-body-xs font-medium px-2 py-0.5 rounded-full bg-brick/10 text-brick">
                      {entry.role_titles.join(" / ")}
                    </span>
                    <p className="text-body-xs text-muted mt-1.5 font-mono">
                      {prod.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {(prod.first_rehearsal || prod.opening_date) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-bone">
                    {prod.first_rehearsal && (
                      <div>
                        <p className="text-body-xs text-muted">First rehearsal</p>
                        <p className="font-mono text-data-sm text-ink">
                          {new Date(prod.first_rehearsal + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                    {prod.opening_date && (
                      <div>
                        <p className="text-body-xs text-muted">Opening</p>
                        <p className="font-mono text-data-sm text-ink">
                          {new Date(prod.opening_date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </ShowLink>
            );
          })}
        </div>
      )}

      {/* Production Health Dashboard — owners and production staff */}
      {canCreate && activeProductions.length > 0 && (
        <div className="mt-10">
          <ProductionHealth
            productionId={activeProductions[0].productions.id}
            productionTitle={activeProductions[0].productions.title}
          />
        </div>
      )}

      {/* Calendar subscription */}
      {person?.calendar_token && (
        <div className="mt-10 pt-6 border-t border-bone">
          <CalendarLink token={person.calendar_token} />
        </div>
      )}
    </div>
  );
}
