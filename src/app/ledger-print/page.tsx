import { createClient } from "@/lib/supabase/server";
import { resolveActingOrgId } from "@/lib/membership";
import { redirect } from "next/navigation";
import { getActiveProductionId } from "@/lib/active-production";
import { PrintButton } from "./print-button";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "");

export default async function LedgerPrintPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: person } = await supabase.from("people").select("id").eq("user_id", user.id).single();
  if (!person) redirect("/login");

  const actingOrgId = await resolveActingOrgId(person.id);
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(name)")
    .eq("person_id", person.id)
    .eq("org_id", actingOrgId ?? "")
    .maybeSingle();
  const isFinance = membership && (membership.role === "owner" || membership.role === "production");
  if (!isFinance) redirect("/ledger");

  const orgName = (membership.organizations as unknown as { name: string } | null)?.name || "";
  const pid = await getActiveProductionId();
  if (!pid) redirect("/ledger");

  const { data: prod } = await supabase.from("productions").select("title").eq("id", pid).single();
  const productionTitle = prod?.title || "";

  const { data: invRows } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, base_amount, payment_method, payment_details, status, w9_required, submitted_at, payee_name, payee_address, payee_email, payee_phone, payers(name, contact_name, email, phone, address), contracts(role_title), invoice_line_items(description, amount, is_base, sort_order)"
    )
    .eq("production_id", pid)
    .order("submitted_at", { ascending: true });

  const invoices = (invRows || []).map((r) => {
    const payer = r.payers as unknown as { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null } | null;
    const contract = r.contracts as unknown as { role_title: string } | null;
    const lines = ((r.invoice_line_items as unknown as { description: string; amount: number; is_base: boolean; sort_order: number }[]) || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({ description: l.description, amount: Number(l.amount), is_base: l.is_base }));
    return {
      id: r.id,
      number: r.invoice_number || r.id.slice(0, 8),
      status: r.status,
      date: r.submitted_at,
      role: contract?.role_title || "",
      w9: r.w9_required,
      method: r.payment_method,
      details: r.payment_details,
      payeeName: r.payee_name || "",
      payeeAddress: r.payee_address || "",
      payeeEmail: r.payee_email || "",
      payeePhone: r.payee_phone || "",
      payer,
      lines,
      total: lines.reduce((s, l) => s + l.amount, 0),
    };
  });

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {productionTitle}</p>
          <p className="text-xs text-gray-500">Use your browser&apos;s print dialog to save as a single PDF or print all at once.</p>
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto">
        {invoices.length === 0 && (
          <p className="text-center text-gray-500 py-20">No invoices submitted yet for {productionTitle}.</p>
        )}
        {invoices.map((inv) => (
          <div key={inv.id} className="px-10 py-12 break-after-page">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
                <p className="text-sm text-gray-600 mt-1">{inv.number}</p>
                <p className="text-sm text-gray-600">Date: {fmtDate(inv.date)}</p>
                {inv.status !== "submitted" && (
                  <p className="text-xs uppercase tracking-wider mt-1 text-gray-500">{inv.status}</p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{productionTitle}</p>
                {inv.role && <p className="text-gray-600">{inv.role}</p>}
                {orgName && <p className="text-gray-500 text-xs mt-1">via {orgName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">From</p>
                <p className="font-medium">{inv.payeeName}</p>
                {inv.payeeAddress && <p className="text-sm text-gray-700 whitespace-pre-line">{inv.payeeAddress}</p>}
                {inv.payeeEmail && <p className="text-sm text-gray-700">{inv.payeeEmail}</p>}
                {inv.payeePhone && <p className="text-sm text-gray-700">{inv.payeePhone}</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Bill to</p>
                <p className="font-medium">{inv.payer?.name || "—"}</p>
                {inv.payer?.contact_name && <p className="text-sm text-gray-700">{inv.payer.contact_name}</p>}
                {inv.payer?.address && <p className="text-sm text-gray-700 whitespace-pre-line">{inv.payer.address}</p>}
                {inv.payer?.email && <p className="text-sm text-gray-700">{inv.payer.email}</p>}
                {inv.payer?.phone && <p className="text-sm text-gray-700">{inv.payer.phone}</p>}
              </div>
            </div>

            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-2 font-semibold">Description</th>
                  <th className="text-right py-2 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-2">{l.description}</td>
                    <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 text-right font-semibold">Total</td>
                  <td className="py-3 text-right font-bold text-lg tabular-nums">{money(inv.total)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="text-sm text-gray-700 border-t border-gray-200 pt-4">
              <p><span className="text-gray-500">Payment method: </span>{inv.method || "—"}{inv.details ? ` (${inv.details})` : ""}</p>
              {inv.w9 && <p className="text-gray-500 text-xs mt-1">W-9 on file for this payee.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
