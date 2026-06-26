import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId, getRoleInOrg, isLeadershipRole } from "@/lib/membership";
import { getActiveProductionId } from "@/lib/active-production";

export const dynamic = "force-dynamic";

const esc = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (headers: string[], rows: unknown[][]): string =>
  [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  if (!person) return new Response("Unauthorized", { status: 401 });

  const orgId = await resolveActingOrgId(person.id);
  if (!orgId) return new Response("No organization", { status: 403 });
  const role = await getRoleInOrg(person.id, orgId);
  if (!isLeadershipRole(role)) return new Response("Forbidden", { status: 403 });

  let pid = await getActiveProductionId();
  if (pid) {
    const { data: check } = await supabase.from("productions").select("id").eq("id", pid).eq("org_id", orgId).maybeSingle();
    if (!check) pid = null;
  }
  if (!pid) {
    const { data: prods } = await supabase.from("productions").select("id").eq("org_id", orgId)
      .in("status", ["pre_production", "rehearsal", "tech", "in_run"]).order("opening_date", { ascending: true }).limit(1);
    pid = prods?.[0]?.id ?? null;
  }
  if (!pid) return new Response("No production", { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "invoices";
  const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).maybeSingle();
  const slug = (prod?.title || "production").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let csv = "";
  let name = "";

  if (type === "budget") {
    const { data } = await supabase.from("budget_items")
      .select("expense_name, category, vendor, budget_amount, is_paid, off_top, notes")
      .eq("production_id", pid).order("category");
    csv = toCsv(
      ["Expense", "Category", "Vendor", "Budget Amount", "Paid", "Off-Top", "Notes"],
      (data || []).map((b) => [b.expense_name, b.category, b.vendor, b.budget_amount, b.is_paid ? "yes" : "no", b.off_top ? "yes" : "no", b.notes]),
    );
    name = `${slug}-budget.csv`;
  } else if (type === "revenue") {
    const { data } = await supabase.from("revenue_items")
      .select("source_name, category, donor_or_event, amount, is_received, notes")
      .eq("production_id", pid).order("category");
    csv = toCsv(
      ["Source", "Category", "Donor/Event", "Amount", "Received", "Notes"],
      (data || []).map((r) => [r.source_name, r.category, r.donor_or_event, r.amount, r.is_received ? "yes" : "no", r.notes]),
    );
    name = `${slug}-revenue.csv`;
  } else {
    const { data } = await supabase.from("invoices")
      .select("invoice_number, status, submitted_at, base_amount, payment_method, payment_details, payee_name, payers(name), contracts(role_title), invoice_line_items(amount)")
      .eq("production_id", pid).order("submitted_at", { ascending: true });
    const rows = (data || []).map((i) => {
      const payer = i.payers as unknown as { name: string } | null;
      const contract = i.contracts as unknown as { role_title: string } | null;
      const lines = (i.invoice_line_items as unknown as { amount: number }[]) || [];
      const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
      return [i.invoice_number, i.payee_name, contract?.role_title || "", i.status, payer?.name || "", i.payment_method || "", i.payment_details || "", i.base_amount, total, i.submitted_at];
    });
    csv = toCsv(
      ["Invoice #", "Payee", "Role", "Status", "Bill To", "Payment Method", "Payment Details", "Base Amount", "Total", "Submitted At"],
      rows,
    );
    name = `${slug}-invoices.csv`;
  }

  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
