import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface Props {
  productionId: string;
  productionTitle: string;
}

interface HealthMetric {
  label: string;
  value: number;
  total: number;
  link: string;
  status: "good" | "warning" | "urgent";
  detail: string;
}

function getStatus(ratio: number, thresholds: { good: number; warning: number }): "good" | "warning" | "urgent" {
  if (ratio >= thresholds.good) return "good";
  if (ratio >= thresholds.warning) return "warning";
  return "urgent";
}

const statusColors = {
  good: "text-confirmed",
  warning: "text-tentative",
  urgent: "text-conflict",
};

const statusBg = {
  good: "bg-confirmed/10",
  warning: "bg-tentative/10",
  urgent: "bg-conflict/10",
};

const statusDot = {
  good: "bg-confirmed",
  warning: "bg-tentative",
  urgent: "bg-conflict",
};

export async function ProductionHealth({ productionId, productionTitle }: Props) {
  const supabase = await createClient();

  // Contracts
  const { data: contracts } = await supabase
    .from("contracts")
    .select("status")
    .eq("production_id", productionId);

  const contractCounts = { draft: 0, pending: 0, signed: 0, countersigned: 0, void: 0 };
  for (const c of contracts || []) {
    contractCounts[c.status as keyof typeof contractCounts] = (contractCounts[c.status as keyof typeof contractCounts] || 0) + 1;
  }
  const contractsTotal = (contracts || []).filter((c) => c.status !== "void").length;
  const contractsDone = contractCounts.countersigned;
  const contractsAwaitingSign = contractCounts.pending;
  const contractsAwaitingCountersign = contractCounts.signed;

  // People + login status
  const { data: assignments } = await supabase
    .from("production_assignments")
    .select("person_id, people!inner(id, user_id, email)")
    .eq("production_id", productionId)
    .eq("active", true);

  const totalPeople = (assignments || []).length;
  const withAccount = (assignments || []).filter((a) => {
    const p = a.people as unknown as { user_id: string | null };
    return p?.user_id;
  }).length;
  const noEmail = (assignments || []).filter((a) => {
    const p = a.people as unknown as { email: string | null; user_id: string | null };
    return !p?.email && !p?.user_id;
  }).length;

  // Upcoming call responses
  const { data: upcomingEvents } = await supabase
    .from("schedule_events")
    .select("id, title, event_date")
    .eq("production_id", productionId)
    .gte("event_date", new Date().toISOString().split("T")[0])
    .order("event_date", { ascending: true });

  let callsTotal = 0;
  let callsResponded = 0;
  if (upcomingEvents && upcomingEvents.length > 0) {
    const eventIds = upcomingEvents.map((e) => e.id);
    const { data: calls } = await supabase
      .from("event_calls")
      .select("id, event_id")
      .in("event_id", eventIds.slice(0, 50));

    callsTotal = (calls || []).length;

    if (calls && calls.length > 0) {
      const callIds = calls.map((c) => c.id);
      const { data: responses } = await supabase
        .from("call_responses")
        .select("event_call_id")
        .in("event_call_id", callIds.slice(0, 200));
      callsResponded = (responses || []).length;
    }
  }

  // Conflicts submitted
  const { data: conflictPeople } = await supabase
    .from("conflicts")
    .select("person_id")
    .in(
      "person_id",
      (assignments || []).map((a) => {
        const p = a.people as unknown as { id: string };
        return p.id;
      })
    );
  const conflictsSubmitted = new Set((conflictPeople || []).map((c) => c.person_id)).size;

  // Script lines
  const { data: script } = await supabase
    .from("scripts")
    .select("id")
    .eq("production_id", productionId)
    .limit(1)
    .single();

  let scriptLines = 0;
  if (script) {
    const { count } = await supabase
      .from("script_lines")
      .select("id", { count: "exact", head: true })
      .eq("script_id", script.id);
    scriptLines = count || 0;
  }

  // Next event
  const nextEvent = upcomingEvents?.[0];

  // Build metrics
  const metrics: HealthMetric[] = [
    {
      label: "Contracts",
      value: contractsDone,
      total: contractsTotal,
      link: "/ledger",
      status: getStatus(contractsTotal > 0 ? contractsDone / contractsTotal : 0, { good: 0.8, warning: 0.5 }),
      detail: contractsAwaitingSign > 0
        ? `${contractsAwaitingSign} awaiting signature`
        : contractsAwaitingCountersign > 0
        ? `${contractsAwaitingCountersign} need countersign`
        : contractsDone === contractsTotal ? "All done" : `${contractsTotal - contractsDone} remaining`,
    },
    {
      label: "Team online",
      value: withAccount,
      total: totalPeople,
      link: "/company",
      status: getStatus(totalPeople > 0 ? withAccount / totalPeople : 0, { good: 0.8, warning: 0.5 }),
      detail: noEmail > 0 ? `${noEmail} missing email` : `${totalPeople - withAccount} haven't logged in`,
    },
    {
      label: "Call responses",
      value: callsResponded,
      total: callsTotal,
      link: "/callboard",
      status: getStatus(callsTotal > 0 ? callsResponded / callsTotal : 1, { good: 0.6, warning: 0.3 }),
      detail: callsTotal - callsResponded > 0 ? `${callsTotal - callsResponded} unresponded` : "All responded",
    },
    {
      label: "Conflicts filed",
      value: conflictsSubmitted,
      total: totalPeople,
      link: "/settings",
      status: getStatus(totalPeople > 0 ? conflictsSubmitted / totalPeople : 0, { good: 0.5, warning: 0.2 }),
      detail: conflictsSubmitted === 0 ? "Nobody has submitted availability" : `${totalPeople - conflictsSubmitted} haven't filed`,
    },
  ];

  // Overall health
  const scores = metrics.map((m) => m.total > 0 ? m.value / m.total : 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const overallStatus = avgScore >= 0.7 ? "good" : avgScore >= 0.4 ? "warning" : "urgent";
  const overallLabel = overallStatus === "good" ? "On track" : overallStatus === "warning" ? "Needs attention" : "At risk";

  // Alerts
  const alerts: { text: string; link: string; level: "urgent" | "warning" }[] = [];

  if (contractsAwaitingSign > 10) alerts.push({ text: `${contractsAwaitingSign} contracts unsigned`, link: "/ledger", level: "urgent" });
  else if (contractsAwaitingSign > 0) alerts.push({ text: `${contractsAwaitingSign} contracts awaiting signature`, link: "/ledger", level: "warning" });

  if (contractsAwaitingCountersign > 0) alerts.push({ text: `${contractsAwaitingCountersign} contracts need your countersign`, link: "/ledger", level: "urgent" });

  if (scriptLines < 50) alerts.push({ text: `Script has only ${scriptLines} lines imported`, link: "/spine", level: "warning" });

  if (conflictsSubmitted === 0) alerts.push({ text: "No one has submitted conflicts yet", link: "/settings", level: "warning" });

  if (totalPeople - withAccount > 5) alerts.push({ text: `${totalPeople - withAccount} people haven't logged in`, link: "/company", level: "warning" });

  return (
    <div className="bg-card border border-bone rounded-card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-display-sm text-ink">Production Health</h2>
          <p className="text-body-xs text-muted mt-0.5">{productionTitle}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-body-xs font-medium ${statusBg[overallStatus]} ${statusColors[overallStatus]}`}>
          {overallLabel}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {metrics.map((m) => {
          const pct = m.total > 0 ? Math.round((m.value / m.total) * 100) : 0;
          return (
            <Link key={m.label} href={m.link}
              className="bg-paper border border-bone/50 rounded-card p-3 hover:border-ash transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-body-xs text-ash">{m.label}</span>
                <span className={`w-2 h-2 rounded-full ${statusDot[m.status]}`} />
              </div>
              <p className="font-display text-display-sm text-ink">
                {m.value}<span className="text-body-sm text-muted font-body">/{m.total}</span>
              </p>
              <div className="w-full h-1.5 bg-bone/50 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  m.status === "good" ? "bg-confirmed" : m.status === "warning" ? "bg-tentative" : "bg-conflict"
                }`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-body-xs text-muted mt-1.5">{m.detail}</p>
            </Link>
          );
        })}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <Link key={i} href={a.link}
              className={`flex items-center gap-2 px-3 py-2 rounded-card text-body-xs ${
                a.level === "urgent" ? "bg-conflict/5 text-conflict" : "bg-tentative/5 text-tentative"
              } hover:opacity-80 transition-opacity`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.level === "urgent" ? "bg-conflict" : "bg-tentative"}`} />
              {a.text}
            </Link>
          ))}
        </div>
      )}

      {/* Next event */}
      {nextEvent && (
        <div className="mt-4 pt-3 border-t border-bone/50">
          <p className="text-body-xs text-muted">
            Next: <span className="text-ink font-medium">{nextEvent.title}</span> —{" "}
            {new Date(nextEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
