import { createClient } from "@/lib/supabase/server";

export type ExportCompanyMember = {
  name: string;
  roleTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
};
export type ExportContract = {
  id: string;
  personName: string;
  roleTitle: string | null;
  compensation: string | null;
  status: string;
  signedAt: string | null;
  countersignedAt: string | null;
};
export type ExportInvoice = {
  id: string;
  number: string;
  payeeName: string;
  payerName: string;
  status: string;
  w9: boolean;
  submittedAt: string | null;
  total: number;
};
export type ExportBudgetItem = {
  id: string;
  name: string;
  category: string;
  budget: number | null;
  actual: number | null;
  isPaid: boolean;
  vendor: string | null;
  paidBy: string | null;
};
export type ExportRevenueItem = {
  id: string;
  source: string;
  category: string;
  amount: number | null;
  donorOrEvent: string | null;
  isReceived: boolean;
  receivedDate: string | null;
};

export type ProductionExport = {
  id: string;
  title: string;
  playwright: string | null;
  venue: string | null;
  status: string;
  firstRehearsal: string | null;
  openingDate: string | null;
  closingDate: string | null;
  company: ExportCompanyMember[];
  contracts: ExportContract[];
  invoices: ExportInvoice[];
  budget: ExportBudgetItem[];
  revenue: ExportRevenueItem[];
  totals: { budget: number; actual: number; revenue: number; received: number };
};

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const personName = (p: { preferred_name: string | null; full_name: string } | null) =>
  p ? p.preferred_name || p.full_name : "";

export async function fetchProductionExport(productionId: string): Promise<ProductionExport | null> {
  const supabase = await createClient();

  const { data: prod } = await supabase
    .from("productions")
    .select("id, title, playwright, venue, status, first_rehearsal, opening_date, closing_date")
    .eq("id", productionId)
    .maybeSingle();
  if (!prod) return null;

  const [asgRes, conRes, invRes, budRes, revRes] = await Promise.all([
    supabase
      .from("production_assignments")
      .select("role_title, department, people!inner(full_name, preferred_name, email, phone)")
      .eq("production_id", productionId)
      .eq("active", true),
    supabase
      .from("contracts")
      .select("id, person_name, role_title, compensation, status, signed_at, countersigned_at")
      .eq("production_id", productionId)
      .order("person_name"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, w9_required, submitted_at, payee_name, payers(name), people(full_name, preferred_name), invoice_line_items(amount)")
      .eq("production_id", productionId)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("budget_items")
      .select("id, expense_name, category, budget_amount, actual_cost, is_paid, vendor, paid_by")
      .eq("production_id", productionId)
      .order("category"),
    supabase
      .from("revenue_items")
      .select("id, source_name, category, amount, donor_or_event, is_received, received_date")
      .eq("production_id", productionId)
      .order("category"),
  ]);

  const company: ExportCompanyMember[] = (asgRes.data || [])
    .map((a): ExportCompanyMember | null => {
      const p = a.people as unknown as { full_name: string; preferred_name: string | null; email: string | null; phone: string | null } | null;
      if (!p) return null;
      return { name: personName(p), roleTitle: a.role_title, department: a.department, email: p.email, phone: p.phone };
    })
    .filter((x): x is ExportCompanyMember => x != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const contracts: ExportContract[] = (conRes.data || []).map((c) => ({
    id: c.id,
    personName: c.person_name || "",
    roleTitle: c.role_title,
    compensation: c.compensation,
    status: c.status,
    signedAt: c.signed_at,
    countersignedAt: c.countersigned_at,
  }));

  const invoices: ExportInvoice[] = (invRes.data || []).map((r) => {
    const payer = r.payers as unknown as { name: string } | null;
    const payee = r.people as unknown as { full_name: string; preferred_name: string | null } | null;
    const lines = (r.invoice_line_items as unknown as { amount: number }[]) || [];
    return {
      id: r.id,
      number: r.invoice_number || r.id.slice(0, 8),
      payeeName: r.payee_name || personName(payee),
      payerName: payer?.name || "—",
      status: r.status,
      w9: !!r.w9_required,
      submittedAt: r.submitted_at,
      total: lines.reduce((s, l) => s + num(l.amount), 0),
    };
  });

  const budget: ExportBudgetItem[] = (budRes.data || []).map((b) => ({
    id: b.id,
    name: b.expense_name,
    category: b.category,
    budget: b.budget_amount == null ? null : num(b.budget_amount),
    actual: b.actual_cost == null ? null : num(b.actual_cost),
    isPaid: !!b.is_paid,
    vendor: b.vendor,
    paidBy: b.paid_by,
  }));

  const revenue: ExportRevenueItem[] = (revRes.data || []).map((r) => ({
    id: r.id,
    source: r.source_name,
    category: r.category,
    amount: r.amount == null ? null : num(r.amount),
    donorOrEvent: r.donor_or_event,
    isReceived: !!r.is_received,
    receivedDate: r.received_date,
  }));

  return {
    id: prod.id,
    title: prod.title,
    playwright: prod.playwright,
    venue: prod.venue,
    status: prod.status,
    firstRehearsal: prod.first_rehearsal,
    openingDate: prod.opening_date,
    closingDate: prod.closing_date,
    company,
    contracts,
    invoices,
    budget,
    revenue,
    totals: {
      budget: budget.reduce((s, b) => s + (b.budget || 0), 0),
      actual: budget.reduce((s, b) => s + (b.actual || 0), 0),
      revenue: revenue.reduce((s, r) => s + (r.amount || 0), 0),
      received: revenue.reduce((s, r) => s + (r.isReceived ? r.amount || 0 : 0), 0),
    },
  };
}

export async function fetchOrgMembers(orgId: string): Promise<ExportCompanyMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("role, people!inner(full_name, preferred_name, email, phone)")
    .eq("org_id", orgId);
  return (data || [])
    .map((m): ExportCompanyMember | null => {
      const p = m.people as unknown as { full_name: string; preferred_name: string | null; email: string | null; phone: string | null } | null;
      if (!p) return null;
      return { name: personName(p), roleTitle: (m.role as string) ?? null, department: null, email: p.email, phone: p.phone };
    })
    .filter((x): x is ExportCompanyMember => x != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchActiveProductionIds(orgId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productions")
    .select("id")
    .eq("org_id", orgId)
    .not("status", "in", "(closed,archived)")
    .order("opening_date", { ascending: true, nullsFirst: false });
  return (data || []).map((p) => p.id);
}
