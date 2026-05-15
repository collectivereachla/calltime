import { createClient } from "@/lib/supabase/server";
import { LedgerLayout } from "./ledger-layout";

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
  const canSeeContent = membership.role === "owner";
  const orgId = (membership.organizations as unknown as { id: string }).id;

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
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id")
        .in("production_id", productionIds)
        .order("person_name");
      contracts = data || [];
    } else {
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id")
        .in("production_id", productionIds)
        .eq("person_id", person!.id);
      contracts = data || [];
    }
  }

  // Load templates
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

  // Load budget items (owner/production only)
  let budgetItems: {
    id: string;
    expense_name: string;
    category: string;
    budget_amount: number | null;
    paid_by: string | null;
    vendor: string | null;
    notes: string | null;
    transaction_date: string | null;
  }[] = [];

  if (canManage && productionIds.length > 0) {
    const { data } = await supabase
      .from("budget_items")
      .select("id, expense_name, category, budget_amount, paid_by, vendor, notes, transaction_date")
      .in("production_id", productionIds)
      .order("category")
      .order("budget_amount", { ascending: false, nullsFirst: false });
    budgetItems = data || [];
  }

  // Build contract summaries with contract_type for budget
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const contractSummaries = contracts.map((c) => ({
    person_name: c.person_name,
    role_title: c.role_title,
    compensation: c.compensation,
    contract_type: templateMap.get(c.template_id)?.contract_type || "other",
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink">Ledger</h1>
        <p className="text-body-md text-ash mt-1">
          {canSeeContent ? "Contracts and budget." : canManage ? "Contract status and budget overview." : "Your contracts."}
        </p>
      </div>

      {contracts.length === 0 && !canManage ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No contracts found for active productions.</p>
        </div>
      ) : (
        <LedgerLayout
          contracts={contracts}
          templates={templates}
          budgetItems={budgetItems}
          contractSummaries={contractSummaries}
          canManage={canManage}
          canSeeContent={canSeeContent}
          personId={person!.id}
          personName={person!.full_name}
        />
      )}
    </div>
  );
}
