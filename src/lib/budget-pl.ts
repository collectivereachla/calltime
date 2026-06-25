// Single source of truth for the Budget tab's P&L. The on-screen Budget view and
// the printable budget report both read these definitions and this computation so
// the printed report always matches what's on screen.

export const EXPENSE_CATS = ["venue", "equipment", "transportation", "other"];
export const REVENUE_CATS = ["sponsor", "ticket_sales", "grant", "donation", "other"];
export const STAFF_TYPES = new Set([
  "crew", "director", "stage_manager", "props_asm", "lighting_design",
  "sound_design", "sound_engineer", "set_design", "original_music",
]);
export const TALENT_TYPES = new Set(["actor", "band"]);

export const CAT_LABELS: Record<string, string> = {
  venue: "Venue", equipment: "Equipment", transportation: "Transportation", other: "Other",
  sponsor: "Sponsors", ticket_sales: "Ticket Sales", grant: "Grants", donation: "Donations",
};

export const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseAmount(comp: string | null): number {
  if (!comp) return 0;
  const match = comp.match(/\$(\d[\d,]*)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, "")) || 0;
}

export interface PLContract {
  id: string;
  person_name: string;
  role_title: string;
  compensation: string | null;
  contract_type: string;
}
export interface PLBudgetItem {
  id: string;
  expense_name: string;
  category: string;
  budget_amount: number | null;
  vendor: string | null;
  notes: string | null;
  is_paid: boolean;
}
export interface PLRevenueItem {
  id: string;
  source_name: string;
  category: string;
  amount: number | null;
  donor_or_event: string | null;
  notes: string | null;
  is_received: boolean;
}

export function computeBudgetPL(
  contracts: PLContract[],
  budgetItems: PLBudgetItem[],
  revenueItems: PLRevenueItem[]
) {
  const staffContracts = contracts
    .filter((c) => STAFF_TYPES.has(c.contract_type))
    .sort((a, b) => parseAmount(b.compensation) - parseAmount(a.compensation));
  const talentContracts = contracts.filter((c) => TALENT_TYPES.has(c.contract_type));

  const staffTotal = staffContracts.reduce((s, c) => s + parseAmount(c.compensation), 0);

  const talentByType: Record<string, { people: PLContract[]; total: number }> = {};
  let talentTotal = 0;
  for (const c of talentContracts) {
    const t = c.contract_type;
    if (!talentByType[t]) talentByType[t] = { people: [], total: 0 };
    talentByType[t].people.push(c);
    const amt = parseAmount(c.compensation);
    talentByType[t].total += amt;
    talentTotal += amt;
  }

  const expByCat: Record<string, PLBudgetItem[]> = {};
  for (const c of EXPENSE_CATS) expByCat[c] = [];
  for (const item of budgetItems) {
    expByCat[EXPENSE_CATS.includes(item.category) ? item.category : "other"].push(item);
  }

  const revByCat: Record<string, PLRevenueItem[]> = {};
  for (const c of REVENUE_CATS) revByCat[c] = [];
  for (const item of revenueItems) {
    revByCat[REVENUE_CATS.includes(item.category) ? item.category : "other"].push(item);
  }

  const expenseTotal = budgetItems.reduce((s, i) => s + (i.budget_amount || 0), 0);
  const revenueTotal = revenueItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCosts = expenseTotal + staffTotal + talentTotal;
  const net = revenueTotal - totalCosts;

  return {
    staffContracts,
    staffTotal,
    talent: { byType: talentByType, total: talentTotal },
    talentContracts,
    expByCat,
    revByCat,
    expenseTotal,
    revenueTotal,
    totalCosts,
    net,
  };
}

// ── Ledger-derived costs that live outside budget_items ──────────────────────
// Stipends = non-base invoice line items (add-ons on top of contracted base,
// which is already counted via contracts). Reimbursements = approved
// expense_receipts. A receipt that was added to an invoice as a line item is
// counted once (from the receipt) and excluded from stipends via its linked
// line-item id, so the same dollar is never counted twice.
export interface ExtraInvoiceLite {
  status: string;
  person_name?: string;
  lines: { id?: string; description: string; amount: number; is_base: boolean }[];
}
export interface ExtraReceiptLite {
  status: string;
  amount: number;
  description: string;
  person_name?: string;
  category?: string | null;
  invoice_line_item_id?: string | null;
}
export interface BudgetExtraItem { label: string; who: string; amount: number; pending?: boolean }

export function computeBudgetExtras(invoices: ExtraInvoiceLite[], receipts: ExtraReceiptLite[]) {
  const COUNTED_INVOICE = new Set(["submitted", "approved", "paid"]);
  const linkedLineIds = new Set(
    receipts.map((r) => r.invoice_line_item_id).filter(Boolean) as string[]
  );

  let stipends = 0;
  const stipendItems: BudgetExtraItem[] = [];
  for (const inv of invoices) {
    if (!COUNTED_INVOICE.has(inv.status)) continue;
    for (const l of inv.lines || []) {
      if (l.is_base) continue;
      if (l.id && linkedLineIds.has(l.id)) continue; // reimbursement, counted below
      stipends += l.amount || 0;
      stipendItems.push({ label: l.description || "Stipend", who: inv.person_name || "—", amount: l.amount || 0 });
    }
  }

  let reimbApproved = 0;
  let reimbPending = 0;
  const reimbItems: BudgetExtraItem[] = [];
  for (const r of receipts) {
    if (r.status === "approved") {
      reimbApproved += r.amount || 0;
      reimbItems.push({ label: r.description || "Reimbursement", who: r.person_name || "—", amount: r.amount || 0 });
    } else if (r.status === "pending") {
      reimbPending += r.amount || 0;
      reimbItems.push({ label: r.description || "Reimbursement", who: r.person_name || "—", amount: r.amount || 0, pending: true });
    }
  }

  return {
    stipends,
    stipendItems,
    reimbApproved,
    reimbPending,
    reimbItems,
    // committed = real obligations added to the budget's cost side
    committed: stipends + reimbApproved,
  };
}
