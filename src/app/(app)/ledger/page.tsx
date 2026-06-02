import { createClient } from "@/lib/supabase/server";
import { getRoleInOrg, isOwnerRole, isLeadershipRole, resolveActingOrgId } from "@/lib/membership";
import { LedgerLayout } from "./ledger-layout";
import { getActiveProductionId } from "@/lib/active-production";
import { parseCompensationAmount } from "./invoice-utils";

export default async function LedgerPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, full_name")
    .eq("user_id", user!.id)
    .single();

  // Resolve the org from the show being worked in — never an arbitrary membership.
  const activeProductionId = await getActiveProductionId();
  const orgId = await resolveActingOrgId(person!.id);

  if (!orgId) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">Open a production to view its ledger.</p>
      </div>
    );
  }

  const role = await getRoleInOrg(person!.id, orgId);
  const canManage = isLeadershipRole(role);
  const canSeeContent = isOwnerRole(role);

  const { data: orgRow } = await supabase
    .from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = orgRow?.name ?? "";
  let productions: { id: string; title: string; first_rehearsal: string | null; opening_date: string | null; closing_date: string | null }[] = [];

  if (activeProductionId) {
    const { data } = await supabase
      .from("productions")
      .select("id, title, first_rehearsal, opening_date, closing_date")
      .eq("id", activeProductionId)
      .eq("org_id", orgId)
      .single();
    if (data) productions = [data];
  }

  if (productions.length === 0) {
    const { data: prods } = await supabase
      .from("productions")
      .select("id, title, first_rehearsal, opening_date, closing_date")
      .eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"])
      .order("opening_date", { ascending: true })
      .limit(1);
    productions = prods || [];
  }

  const productionIds = productions.map((p) => p.id);

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
    contract_body: string | null;
    signature_typed: string | null;
    signature_draw_url: string | null;
    countersigned_typed: string | null;
    countersigned_draw_url: string | null;
  }[] = [];

  if (productionIds.length > 0) {
    if (canManage) {
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id, contract_body, signature_typed, signature_draw_url, countersigned_typed, countersigned_draw_url")
        .in("production_id", productionIds)
        .order("person_name");
      contracts = data || [];
    } else {
      const { data } = await supabase
        .from("contracts")
        .select("id, person_name, person_id, role_title, compensation, status, signed_at, countersigned_at, viewed_at, template_id, production_id, contract_body, signature_typed, signature_draw_url, countersigned_typed, countersigned_draw_url")
        .in("production_id", productionIds)
        .eq("person_id", person!.id);
      contracts = data || [];
    }
  }

  // Load templates used by contracts
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

  // Load ALL templates for the Templates tab (owner only)
  let allTemplates: {
    id: string;
    contract_type: string;
    title: string;
    body_markdown: string;
    is_system: boolean;
  }[] = [];

  if (canSeeContent && productionIds.length > 0) {
    const { data } = await supabase
      .from("contract_templates")
      .select("id, contract_type, title, body_markdown, is_system")
      .in("production_id", productionIds)
      .order("title");
    allTemplates = (data || []).map((t) => ({ ...t, is_system: false }));
  }

  // System templates (available to all orgs)
  let systemTemplates: {
    id: string;
    contract_type: string;
    title: string;
    body_markdown: string;
    is_system: boolean;
  }[] = [];

  if (canSeeContent) {
    const { data } = await supabase
      .from("contract_templates")
      .select("id, contract_type, title, body_markdown, is_system")
      .eq("is_system", true)
      .order("title");
    systemTemplates = data || [];
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
    is_paid: boolean;
    paid_date: string | null;
  }[] = [];

  if (canManage && productionIds.length > 0) {
    const { data } = await supabase
      .from("budget_items")
      .select("id, expense_name, category, budget_amount, paid_by, vendor, notes, transaction_date, is_paid, paid_date")
      .in("production_id", productionIds)
      .order("category")
      .order("budget_amount", { ascending: false, nullsFirst: false });
    budgetItems = data || [];
  }

  // Build contract summaries with contract_type for budget
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const contractSummaries = contracts.map((c) => ({
    id: c.id,
    person_name: c.person_name,
    role_title: c.role_title,
    compensation: c.compensation,
    contract_type: templateMap.get(c.template_id)?.contract_type || "other",
  }));

  // Load revenue items (owner/production only)
  let revenueItems: {
    id: string;
    source_name: string;
    category: string;
    amount: number | null;
    donor_or_event: string | null;
    received_date: string | null;
    notes: string | null;
    platform: string | null;
    is_received: boolean;
  }[] = [];

  if (canManage && productionIds.length > 0) {
    const { data } = await supabase
      .from("revenue_items")
      .select("id, source_name, category, amount, donor_or_event, received_date, notes, platform, is_received")
      .in("production_id", productionIds)
      .order("category")
      .order("amount", { ascending: false, nullsFirst: false });
    revenueItems = data || [];
  }

  // ---- Invoices ----
  const activePid = productionIds[0] || null;
  type InvoiceRow = {
    id: string; person_id: string; base_amount: number; payment_method: string | null;
    payment_details: string | null; status: string; w9_required: boolean; submitted_at: string;
    person_name: string; payer_name: string | null; total: number;
    lines: { id?: string; description: string; amount: number; is_base: boolean }[];
  };
  let invoiceMyContract:
    | { id: string; role_title: string; compensation: string | null; billTo: string | null; baseAmount: number | null }
    | null = null;
  let invoicePaymentMethods: { method: string; label: string | null; details: string | null }[] = [];
  let invoiceW9Threshold = 600;
  let invoiceW9OnFile = false;
  let invoiceMyAddress = "";
  let invoices: InvoiceRow[] = [];
  let invoiceDefaultPayerId: string | null = null;
  let invoiceFinancePayers: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }[] = [];
  let invoiceFinanceMethods: { id: string; method: string; label: string | null; production_id: string | null; enabled: boolean }[] = [];

  if (activePid) {
    const { data: orgRow } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
    invoiceW9Threshold = Number((orgRow?.settings as Record<string, unknown> | null)?.w9_threshold ?? 600);

    const [{ data: payersData }, { data: prodRow }, { data: pmData }, { data: md }, { data: myCRow }] =
      await Promise.all([
        supabase.from("payers").select("id, name").eq("org_id", orgId),
        supabase.from("productions").select("default_payer_id").eq("id", activePid).single(),
        supabase
          .from("payment_method_options")
          .select("method, label, details, production_id, enabled, sort_order")
          .eq("org_id", orgId)
          .or(`production_id.is.null,production_id.eq.${activePid}`)
          .eq("enabled", true)
          .order("sort_order"),
        supabase.from("member_details").select("w9_submitted, w9_tax_year, mailing_address").eq("person_id", person!.id).eq("org_id", orgId).maybeSingle(),
        supabase
          .from("contracts")
          .select("id, role_title, compensation, payer_id")
          .eq("production_id", activePid)
          .eq("person_id", person!.id)
          .eq("status", "countersigned")
          .maybeSingle(),
      ]);

    const payerName = new Map((payersData || []).map((p) => [p.id, p.name]));
    const defaultPayerId = prodRow?.default_payer_id || null;
    invoiceDefaultPayerId = defaultPayerId;
    invoicePaymentMethods = (pmData || []).map((m) => ({ method: m.method, label: m.label, details: m.details }));
    invoiceW9OnFile = !!md?.w9_submitted && Number(md?.w9_tax_year) >= new Date().getFullYear();
    invoiceMyAddress = md?.mailing_address || "";

    if (canManage) {
      const [{ data: allPayers }, { data: allMethods }] = await Promise.all([
        supabase.from("payers").select("id, name, contact_name, email, phone, address").eq("org_id", orgId).order("name"),
        supabase
          .from("payment_method_options")
          .select("id, method, label, production_id, enabled, sort_order")
          .eq("org_id", orgId)
          .or(`production_id.is.null,production_id.eq.${activePid}`)
          .order("sort_order"),
      ]);
      invoiceFinancePayers = allPayers || [];
      invoiceFinanceMethods = (allMethods || []).map((m) => ({
        id: m.id, method: m.method, label: m.label, production_id: m.production_id, enabled: m.enabled,
      }));
    }

    if (myCRow) {
      const billToId = myCRow.payer_id || defaultPayerId;
      invoiceMyContract = {
        id: myCRow.id,
        role_title: myCRow.role_title,
        compensation: myCRow.compensation,
        billTo: billToId ? payerName.get(billToId) || null : null,
        baseAmount: parseCompensationAmount(myCRow.compensation),
      };
    }

    let invQ = supabase
      .from("invoices")
      .select(
        "id, person_id, base_amount, payment_method, payment_details, status, w9_required, submitted_at, people(full_name, preferred_name), payers(name), invoice_line_items(id, description, amount, is_base, sort_order)"
      )
      .eq("production_id", activePid);
    if (!canManage) invQ = invQ.eq("person_id", person!.id);
    const { data: invRows } = await invQ.order("submitted_at", { ascending: false });

    invoices = (invRows || []).map((r) => {
      const p = r.people as unknown as { full_name: string; preferred_name: string | null } | null;
      const pay = r.payers as unknown as { name: string } | null;
      const lines = ((r.invoice_line_items as unknown as { id: string; description: string; amount: number; is_base: boolean; sort_order: number }[]) || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({ id: l.id, description: l.description, amount: Number(l.amount), is_base: l.is_base }));
      return {
        id: r.id,
        person_id: r.person_id,
        base_amount: Number(r.base_amount),
        payment_method: r.payment_method,
        payment_details: r.payment_details,
        status: r.status,
        w9_required: r.w9_required,
        submitted_at: r.submitted_at,
        person_name: p ? p.preferred_name || p.full_name : "—",
        payer_name: pay?.name || null,
        total: lines.reduce((s, l) => s + l.amount, 0),
        lines,
      };
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-ink">Ledger</h1>
          <p className="text-body-md text-ash mt-1">
            {canSeeContent ? "Contracts and budget." : canManage ? "Contract status and budget overview." : "Your contracts."}
          </p>
        </div>
        {canSeeContent && (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <a href="/ledger/organization" className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-brick text-paper hover:bg-brick/90 whitespace-nowrap">
              Organization budget
            </a>
            <a href="/export/production" className="px-3 py-1.5 text-body-xs font-medium rounded-card bg-ink text-paper hover:bg-ink/90 whitespace-nowrap">
              Export this production
            </a>
            <a href="/export/organization" className="px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ash hover:text-ink hover:border-ash whitespace-nowrap">
              Export {orgName || "organization"}
            </a>
          </div>
        )}
      </div>

      {contracts.length === 0 && !canManage ? (
        <div className="bg-card border border-bone rounded-card px-6 py-10 text-center">
          <p className="text-body-md text-ash">No contracts found for active productions.</p>
        </div>
      ) : (
        <LedgerLayout
          contracts={contracts}
          templates={templates}
          allTemplates={allTemplates}
          budgetItems={budgetItems}
          revenueItems={revenueItems}
          contractSummaries={contractSummaries}
          canManage={canManage}
          canSeeContent={canSeeContent}
          personId={person!.id}
          personName={person!.full_name}
          productionId={productionIds[0] || ""}
          orgName={orgName}
          productions={productions || []}
          systemTemplates={systemTemplates}
          invoices={invoices}
          invoiceMyContract={invoiceMyContract}
          invoicePaymentMethods={invoicePaymentMethods}
          invoiceW9Threshold={invoiceW9Threshold}
          invoiceW9OnFile={invoiceW9OnFile}
          invoiceMyAddress={invoiceMyAddress}
          invoiceProductionId={activePid || ""}
          invoiceProductionTitle={productions[0]?.title || ""}
          invoiceOrgId={orgId}
          invoiceDefaultPayerId={invoiceDefaultPayerId}
          invoiceFinancePayers={invoiceFinancePayers}
          invoiceFinanceMethods={invoiceFinanceMethods}
        />
      )}
    </div>
  );
}
