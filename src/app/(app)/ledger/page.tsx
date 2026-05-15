import { createClient } from "@/lib/supabase/server";
import { LedgerView } from "./ledger-view";

export default async function LedgerPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name")
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
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No organization found.</p>
      </div>
    );
  }

  const canManage = membership.role === "owner" || membership.role === "production";
  const orgId = (membership.organizations as unknown as { id: string }).id;

  // Get active productions
  const { data: productions } = await supabase
    .from("productions")
    .select("id, title")
    .eq("org_id", orgId)
    .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
    .order("opening_date", { ascending: true });

  const productionIds = productions?.map((p) => p.id) || [];

  // Load contracts
  let contracts: {
    id: string;
    person_name: string;
    person_id: string;
    role_title: string;
    compensation: string | null;
    status: string;
    signed_at: string | null;
    countersigned_at: string | null;
    viewed_at: string | null;
    template_id: string;
    production_id: string;
  }[] = [];

  if (productionIds.length > 0) {
    if (canManage) {
      // Owner sees all contracts
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id")
        .in("production_id", productionIds)
        .order("person_name");
      contracts = data || [];
    } else {
      // Member sees only their own
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id")
        .in("production_id", productionIds)
        .eq("person_id", person!.id);
      contracts = data || [];
    }
  }

  // Load templates for rendering contract bodies
  let templates: {
    id: string;
    contract_type: string;
    title: string;
    body_markdown: string;
  }[] = [];

  if (contracts.length > 0) {
    const templateIds = [...new Set(contracts.map((c) => c.template_id))];
    const { data } = await supabase
      .from("contract_templates")
      .select("id, contract_type, title, body_markdown")
      .in("id", templateIds);
    templates = data || [];
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink">Ledger</h1>
        <p className="text-body-md text-ash mt-1">
          {canManage ? "Contract management and signing status." : "Your contracts."}
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No contracts found for active productions.</p>
        </div>
      ) : (
        <LedgerView
          contracts={contracts}
          templates={templates}
          canManage={canManage}
          personId={person!.id}
          personName={person!.full_name}
        />
      )}
    </div>
  );
}
