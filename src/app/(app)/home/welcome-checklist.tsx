import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface Props {
  personId: string;
  productionId: string;
}

export async function WelcomeChecklist({ personId, productionId }: Props) {
  const supabase = await createClient();

  // Check each step
  const { count: pendingContracts } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .eq("status", "pending");

  const { count: signedContracts } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .in("status", ["signed", "countersigned"]);

  const { count: responses } = await supabase
    .from("call_responses")
    .select("id", { count: "exact", head: true })
    .eq("responded_by", (await supabase.auth.getUser()).data.user?.id || "");

  const { data: person } = await supabase
    .from("people")
    .select("phone, bio, headshot_url")
    .eq("id", personId)
    .single();

  const hasProfile = person?.phone || person?.bio;
  const hasContract = (signedContracts || 0) > 0;
  const hasResponded = (responses || 0) > 0;
  const hasPending = (pendingContracts || 0) > 0;

  // Don't show if everything is done
  if (hasContract && hasResponded && hasProfile) return null;

  const steps = [
    {
      done: hasContract,
      label: hasPending ? "Sign your contract" : "Contract",
      desc: hasPending ? `You have ${pendingContracts} contract${pendingContracts === 1 ? "" : "s"} waiting.` : "All signed.",
      href: "/ledger",
      urgent: hasPending,
    },
    {
      done: hasResponded,
      label: "Respond to your calls",
      desc: hasResponded ? "You've responded." : "Check the Callboard and confirm your availability.",
      href: "/callboard",
      urgent: !hasResponded,
    },
    {
      done: !!hasProfile,
      label: "Complete your profile",
      desc: hasProfile ? "Looking good." : "Add your phone number so your SM can reach you.",
      href: "/settings",
      urgent: false,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="bg-card border border-brick/20 rounded-card p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-display-sm text-ink">Getting Started</h3>
        <span className="text-body-xs text-muted">{doneCount}/{steps.length}</span>
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <Link key={step.label} href={step.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-card transition-colors ${
              step.done ? "bg-confirmed/5" : step.urgent ? "bg-brick/5 hover:bg-brick/10" : "hover:bg-bone/30"
            }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-body-xs shrink-0 ${
              step.done ? "bg-confirmed text-paper" : "border border-bone"
            }`}>
              {step.done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-body-sm ${step.done ? "text-ash line-through" : "text-ink font-medium"}`}>{step.label}</p>
              <p className="text-body-xs text-muted">{step.desc}</p>
            </div>
            {!step.done && <span className="text-body-xs text-muted shrink-0">→</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
