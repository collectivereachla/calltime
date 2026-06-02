import { createClient } from "@/lib/supabase/server";

export type ShowRollup = {
  id: string;
  title: string;
  status: string;
  budget: number;
  spent: number;
  revenue: number;
  received: number;
};

export type OrgBudgetRollup = {
  shows: ShowRollup[];
  totals: { budget: number; spent: number; revenue: number; received: number };
};

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function fetchOrgBudgetRollup(orgId: string): Promise<OrgBudgetRollup> {
  const supabase = await createClient();

  const { data: prods } = await supabase
    .from("productions")
    .select("id, title, status")
    .eq("org_id", orgId)
    .not("status", "in", "(closed,archived)")
    .order("opening_date", { ascending: true, nullsFirst: false });

  const productions = prods || [];
  const ids = productions.map((p) => p.id);

  const empty: OrgBudgetRollup = { shows: [], totals: { budget: 0, spent: 0, revenue: 0, received: 0 } };
  if (ids.length === 0) return empty;

  const [budRes, revRes] = await Promise.all([
    supabase.from("budget_items").select("production_id, budget_amount, actual_cost").in("production_id", ids),
    supabase.from("revenue_items").select("production_id, amount, is_received").in("production_id", ids),
  ]);

  const budByProd = new Map<string, { budget: number; spent: number }>();
  for (const b of budRes.data || []) {
    const e = budByProd.get(b.production_id as string) || { budget: 0, spent: 0 };
    e.budget += num(b.budget_amount);
    e.spent += num(b.actual_cost);
    budByProd.set(b.production_id as string, e);
  }

  const revByProd = new Map<string, { revenue: number; received: number }>();
  for (const r of revRes.data || []) {
    const e = revByProd.get(r.production_id as string) || { revenue: 0, received: 0 };
    const amt = num(r.amount);
    e.revenue += amt;
    if (r.is_received) e.received += amt;
    revByProd.set(r.production_id as string, e);
  }

  const shows: ShowRollup[] = productions.map((p) => {
    const b = budByProd.get(p.id) || { budget: 0, spent: 0 };
    const r = revByProd.get(p.id) || { revenue: 0, received: 0 };
    return { id: p.id, title: p.title, status: p.status, budget: b.budget, spent: b.spent, revenue: r.revenue, received: r.received };
  });

  return {
    shows,
    totals: {
      budget: shows.reduce((s, x) => s + x.budget, 0),
      spent: shows.reduce((s, x) => s + x.spent, 0),
      revenue: shows.reduce((s, x) => s + x.revenue, 0),
      received: shows.reduce((s, x) => s + x.received, 0),
    },
  };
}
