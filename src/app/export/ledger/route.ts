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
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const csvResponse = (csv: string, name: string) =>
  new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });

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

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "invoices";

  // ---- 1099 prep: org-wide, current calendar year (who you paid >= $600 + W-9 status) ----
  if (type === "1099") {
    const year = new Date().getFullYear();
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const { data: prods } = await supabase.from("productions").select("id").eq("org_id", orgId);
    const pids = (prods || []).map((p) => p.id);
    const { data: invs } = pids.length
      ? await supabase.from("invoices")
          .select("person_id, status, submitted_at, created_at, people(full_name, email), invoice_line_items(amount)")
          .in("production_id", pids)
      : { data: [] as unknown[] };
    const { data: md } = await supabase.from("member_details").select("person_id, w9_submitted, w9_tax_year").eq("org_id", orgId);
    const w9 = new Map((md || []).map((d) => [d.person_id, d as { w9_submitted: boolean; w9_tax_year: number | null }]));

    const agg = new Map<string, { name: string; email: string; total: number }>();
    for (const i of (invs || []) as Record<string, unknown>[]) {
      if (i.status === "void" || i.status === "donated") continue;
      const when = (i.submitted_at as string) || (i.created_at as string);
      if (!when || new Date(when).getFullYear() !== year) continue;
      const p = i.people as unknown as { full_name: string; email: string | null } | null;
      const lines = (i.invoice_line_items as unknown as { amount: number }[]) || [];
      const t = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
      const cur = agg.get(i.person_id as string) || { name: p?.full_name || "", email: p?.email || "", total: 0 };
      cur.total += t;
      agg.set(i.person_id as string, cur);
    }
    const rows = [...agg.entries()]
      .map(([pid, v]) => {
        const d = w9.get(pid);
        const w9ok = !!d?.w9_submitted && Number(d?.w9_tax_year) >= year;
        return [v.name, v.email, v.total.toFixed(2), v.total >= 600 ? "YES" : "no", w9ok ? "yes" : "no", d?.w9_tax_year ?? ""];
      })
      .sort((a, b) => Number(b[2]) - Number(a[2]));
    const csv = toCsv(["Payee", "Email", `Total Paid ${year}`, "Needs 1099 (>=$600)", "W-9 on file", "W-9 tax year"], rows);
    return csvResponse(csv, `${slugify(org?.name || "org")}-1099-prep-${year}.csv`);
  }

  // ---- production-scoped exports ----
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

  const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).maybeSingle();
  const slug = slugify(prod?.title || "production");

  if (type === "budget") {
    const { data } = await supabase.from("budget_items")
      .select("expense_name, category, vendor, budget_amount, is_paid, off_top, notes")
      .eq("production_id", pid).order("category");
    const csv = toCsv(
      ["Expense", "Category", "Vendor", "Budget Amount", "Paid", "Off-Top", "Notes"],
      (data || []).map((b) => [b.expense_name, b.category, b.vendor, b.budget_amount, b.is_paid ? "yes" : "no", b.off_top ? "yes" : "no", b.notes]),
    );
    return csvResponse(csv, `${slug}-budget.csv`);
  }
  if (type === "revenue") {
    const { data } = await supabase.from("revenue_items")
      .select("source_name, category, donor_or_event, amount, is_received, notes")
      .eq("production_id", pid).order("category");
    const csv = toCsv(
      ["Source", "Category", "Donor/Event", "Amount", "Received", "Notes"],
      (data || []).map((r) => [r.source_name, r.category, r.donor_or_event, r.amount, r.is_received ? "yes" : "no", r.notes]),
    );
    return csvResponse(csv, `${slug}-revenue.csv`);
  }

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
  const csv = toCsv(
    ["Invoice #", "Payee", "Role", "Status", "Bill To", "Payment Method", "Payment Details", "Base Amount", "Total", "Submitted At"],
    rows,
  );
  return csvResponse(csv, `${slug}-invoices.csv`);
}
