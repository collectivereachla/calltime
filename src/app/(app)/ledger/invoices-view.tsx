"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitInvoice, setInvoiceStatus, addInvoiceLine, deleteInvoiceLine } from "./invoice-actions";
import { submitReceipt, reviewReceipt, deleteReceipt, getReceiptSignedUrl } from "./receipt-actions";
import { PaymentSettings } from "./payment-settings";

interface PaymentMethod { method: string; label: string | null; details: string | null }
interface MyContract {
  id: string; role_title: string; compensation: string | null;
  billTo: string | null; baseAmount: number | null;
}
export interface InvoiceRow {
  id: string; person_id: string; base_amount: number; payment_method: string | null;
  payment_details: string | null; status: string; w9_required: boolean; submitted_at: string;
  person_name: string; payer_name: string | null; total: number;
  lines: { id?: string; description: string; amount: number; is_base: boolean }[];
}

export interface ReceiptRow {
  id: string; person_id: string; person_name: string; description: string;
  category: string | null; amount: number; expense_date: string | null;
  status: string; receipt_path: string | null; review_note: string | null; created_at: string;
  invoice_line_item_id?: string | null;
}

interface Props {
  canManage: boolean;
  personId: string;
  myContract: MyContract | null;
  paymentMethods: PaymentMethod[];
  w9Threshold: number;
  w9OnFile: boolean;
  myAddress: string;
  invoices: InvoiceRow[];
  productionId: string;
  productionTitle: string;
  orgId: string;
  defaultPayerId: string | null;
  financePayers: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }[];
  financeMethods: { id: string; method: string; label: string | null; production_id: string | null; enabled: boolean }[];
  receipts: ReceiptRow[];
  canSubmitReceipts: boolean;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 === 0 ? 0 : 2 });

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-tentative/15 text-tentative",
  approved: "bg-ink/10 text-ink",
  paid: "bg-confirmed/15 text-confirmed",
  void: "bg-ash/10 text-ash",
};

function InvoiceCard({ inv, canManage }: { inv: InvoiceRow; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [desc, setDesc] = useState("Stipend");
  const [amount, setAmount] = useState("");

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (r?.error) { setErr(r.error); return false; }
    router.refresh();
    return true;
  }

  return (
    <div className="bg-card border border-bone rounded-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && <span className="text-body-sm font-medium text-ink">{inv.person_name}</span>}
            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${STATUS_STYLE[inv.status] || "bg-ash/10 text-ash"}`}>{inv.status}</span>
            {inv.w9_required && <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-brick/10 text-brick">W-9</span>}
          </div>
          <p className="text-body-xs text-muted mt-0.5">
            {inv.payer_name ? `Bill to ${inv.payer_name}` : "No payer set"}
            {inv.payment_method ? ` · ${inv.payment_method}` : ""}
            {inv.payment_details ? ` (${inv.payment_details})` : ""}
          </p>
        </div>
        <p className="text-body-md font-semibold text-ink shrink-0">{money(inv.total)}</p>
      </div>

      {inv.lines.length > 1 && (
        <div className="mt-2 pt-2 border-t border-bone/60 space-y-0.5">
          {inv.lines.map((l, i) => (
            <div key={l.id || i} className="flex items-center justify-between text-body-xs text-ash">
              <span>{l.description}{l.is_base ? "" : " (added)"}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{money(l.amount)}</span>
                {canManage && !l.is_base && l.id && (
                  <button onClick={() => run(() => deleteInvoiceLine(l.id!))} disabled={busy} className="text-ash hover:text-brick">✕</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mt-3 pt-2 border-t border-bone/60 flex items-center gap-2 flex-wrap">
          <select
            value={inv.status}
            disabled={busy}
            onChange={(e) => run(() => setInvoiceStatus(inv.id, e.target.value))}
            className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick"
          >
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>

          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="text-body-xs text-brick hover:underline">+ Add line</button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick w-28" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$" className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick w-20" />
              <button
                onClick={async () => {
                  const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
                  if (!(n > 0)) { setErr("Enter an amount."); return; }
                  const ok = await run(() => addInvoiceLine(inv.id, desc, n));
                  if (ok) { setAddOpen(false); setAmount(""); setDesc("Stipend"); }
                }}
                disabled={busy}
                className="px-2 py-1 text-body-xs font-medium rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-50"
              >Add</button>
              <button onClick={() => setAddOpen(false)} disabled={busy} className="text-body-xs text-ash hover:text-ink">Cancel</button>
            </div>
          )}
        </div>
      )}
      {err && <p className="text-body-xs text-brick mt-1">{err}</p>}
    </div>
  );
}

const RECEIPT_STATUS_STYLE: Record<string, string> = {
  pending: "bg-tentative/15 text-tentative",
  approved: "bg-confirmed/15 text-confirmed",
  rejected: "bg-brick/10 text-brick",
  paid: "bg-confirmed/15 text-confirmed",
};

function ReceiptViewLink({ path }: { path: string | null }) {
  const [busy, setBusy] = useState(false);
  if (!path) return <span className="text-body-xs text-muted">No file</span>;
  return (
    <button
      onClick={async () => {
        setBusy(true);
        const r = await getReceiptSignedUrl(path);
        setBusy(false);
        if (r.url) window.open(r.url, "_blank", "noopener");
      }}
      disabled={busy}
      className="text-body-xs text-brick hover:underline disabled:opacity-50"
    >
      {busy ? "Opening…" : "View receipt"}
    </button>
  );
}

function ReceiptReviewCard({ r }: { r: ReceiptRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function decide(decision: "approve" | "reject") {
    setBusy(true); setErr(null);
    const res = await reviewReceipt(r.id, decision, note);
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    router.refresh();
  }

  return (
    <div className="bg-card border border-bone rounded-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-body-sm font-medium text-ink">{r.person_name}</span>
          <p className="text-body-sm text-ink mt-0.5">{r.description}</p>
          <p className="text-body-xs text-muted mt-0.5">
            {r.category ? `${r.category} · ` : ""}
            {r.expense_date ? new Date(r.expense_date + "T00:00:00").toLocaleDateString() : "no date"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-body-md font-semibold text-ink">{money(r.amount)}</p>
          <ReceiptViewLink path={r.receipt_path} />
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-bone/60 flex items-center gap-2 flex-wrap">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="px-2 py-1 text-body-xs rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick flex-1 min-w-[8rem]"
        />
        <button onClick={() => decide("approve")} disabled={busy} className="px-2.5 py-1 text-body-xs font-medium rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
          Approve → add to invoice
        </button>
        <button onClick={() => decide("reject")} disabled={busy} className="px-2.5 py-1 text-body-xs font-medium rounded border border-bone text-ash hover:text-brick hover:border-brick disabled:opacity-50">
          Reject
        </button>
      </div>
      {err && <p className="text-body-xs text-brick mt-1">{err}</p>}
    </div>
  );
}

function ReceiptRowItem({ r, showWho }: { r: ReceiptRow; showWho?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="bg-card border border-bone rounded-card px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showWho && <span className="text-body-sm font-medium text-ink">{r.person_name}</span>}
            <span className="text-body-sm text-ink truncate">{r.description}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${RECEIPT_STATUS_STYLE[r.status] || "bg-ash/10 text-ash"}`}>{r.status}</span>
          </div>
          <p className="text-body-xs text-muted mt-0.5">
            {r.category ? `${r.category} · ` : ""}
            {r.expense_date ? new Date(r.expense_date + "T00:00:00").toLocaleDateString() : "no date"}
            {(r.status === "rejected" || r.status === "approved") && r.review_note ? ` · ${r.review_note}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 flex items-center gap-3">
          <span className="text-body-sm font-semibold text-ink">{money(r.amount)}</span>
          <ReceiptViewLink path={r.receipt_path} />
          {r.status === "pending" && (
            <button
              onClick={async () => {
                setBusy(true); setErr(null);
                const res = await deleteReceipt(r.id);
                setBusy(false);
                if (res?.error) { setErr(res.error); return; }
                router.refresh();
              }}
              disabled={busy}
              className="text-ash hover:text-brick disabled:opacity-50"
              title="Withdraw"
            >✕</button>
          )}
        </div>
      </div>
      {err && <p className="text-body-xs text-brick mt-1">{err}</p>}
    </div>
  );
}

function SubmitReceiptCard({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = () => rej(new Error("Couldn't read the file."));
      reader.readAsDataURL(f);
    });
  }

  // Downscale photos in the browser so a big phone image doesn't blow past the
  // upload limit. PDFs and anything we can't draw pass through untouched.
  const CANVAS_TYPES = ["image/jpeg", "image/png", "image/webp"];
  async function processFile(f: File): Promise<{ base64: string; contentType: string }> {
    const dataUrl = await fileToDataUrl(f);
    if (!CANVAS_TYPES.includes(f.type)) {
      return { base64: dataUrl, contentType: f.type || "application/octet-stream" };
    }
    try {
      const img = document.createElement("img");
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode"));
        img.src = dataUrl;
      });
      const maxEdge = 2000;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxEdge) {
        const s = maxEdge / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { base64: dataUrl, contentType: f.type };
      ctx.drawImage(img, 0, 0, w, h);
      return { base64: canvas.toDataURL("image/jpeg", 0.82), contentType: "image/jpeg" };
    } catch {
      return { base64: dataUrl, contentType: f.type };
    }
  }

  async function submit() {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) { setErr("Enter an amount."); return; }
    if (!description.trim()) { setErr("Add a short note of what this was for."); return; }
    if (file && file.size > 10 * 1024 * 1024) { setErr("File is too large (max 10 MB)."); return; }
    setBusy(true); setErr(null); setDone(false);
    try {
      let base64File = ""; let contentType = "";
      if (file) { const p = await processFile(file); base64File = p.base64; contentType = p.contentType; }
      const res = await submitReceipt({ base64File, contentType, amount: n, description, category, expenseDate, productionId });
      if (res?.error) { setErr(res.error); setBusy(false); return; }
      setAmount(""); setDescription(""); setCategory(""); setExpenseDate(""); setFile(null);
      setDone(true);
      setBusy(false);
      router.refresh();
    } catch {
      setBusy(false);
      setErr("That didn't go through. The file may be too large or the connection dropped, try a smaller photo or a PDF.");
    }
  }

  return (
    <div className="bg-card border border-bone rounded-card p-5">
      <h3 className="text-body-md font-medium text-ink mb-1">Submit a receipt</h3>
      <p className="text-body-xs text-muted mb-4">
        For something you paid out of pocket. Once approved, the amount is added to your invoice.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-body-xs text-muted block mb-1">Amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$0.00" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
        </div>
        <div>
          <label className="text-body-xs text-muted block mb-1">Date of purchase</label>
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-body-xs text-muted block mb-1">What was it for?</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Fabric for Act 2 costumes" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
      </div>
      <div className="mb-3">
        <label className="text-body-xs text-muted block mb-1">Category (optional)</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Props, Costumes, Travel…" className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
      </div>
      <div className="mb-4">
        <label className="text-body-xs text-muted block mb-1">Receipt photo or PDF (optional but recommended)</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-body-xs text-ash file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-ink file:text-paper file:text-body-xs hover:file:bg-ink/90" />
      </div>
      {err && <p className="text-body-sm text-brick mb-3">{err}</p>}
      {done && <p className="text-body-sm text-confirmed mb-3">Receipt submitted for review.</p>}
      <button onClick={submit} disabled={busy} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors disabled:opacity-50">
        {busy ? "Submitting…" : "Submit receipt"}
      </button>
    </div>
  );
}

function ReceiptsSection({ receipts, canManage, canSubmit, productionId, personId }: {
  receipts: ReceiptRow[]; canManage: boolean; canSubmit: boolean; productionId: string; personId: string;
}) {
  const pending = receipts.filter((r) => r.status === "pending");
  const reviewed = receipts.filter((r) => r.status !== "pending");
  const mine = receipts.filter((r) => r.person_id === personId);

  return (
    <div className="space-y-6 border-t border-bone pt-8">
      <p className="text-body-xs text-muted uppercase tracking-wider">Receipts &amp; reimbursements</p>

      {canSubmit && <SubmitReceiptCard productionId={productionId} />}

      {canManage && pending.length > 0 && (
        <div>
          <p className="text-body-sm font-medium text-ink mb-2">Awaiting review ({pending.length})</p>
          <div className="space-y-2">{pending.map((r) => <ReceiptReviewCard key={r.id} r={r} />)}</div>
        </div>
      )}

      {canManage && reviewed.length > 0 && (
        <div>
          <p className="text-body-sm font-medium text-ink mb-2">Reviewed</p>
          <div className="space-y-2">{reviewed.map((r) => <ReceiptRowItem key={r.id} r={r} showWho />)}</div>
        </div>
      )}

      {!canManage && mine.length > 0 && (
        <div>
          <p className="text-body-sm font-medium text-ink mb-2">Your receipts</p>
          <div className="space-y-2">{mine.map((r) => <ReceiptRowItem key={r.id} r={r} />)}</div>
        </div>
      )}

      {canManage && pending.length === 0 && reviewed.length === 0 && (
        <p className="text-body-sm text-ash">No receipts submitted yet.</p>
      )}
    </div>
  );
}

export function InvoicesView(props: Props) {
  const { canManage, personId, myContract, paymentMethods, w9Threshold, w9OnFile, myAddress, invoices } = props;
  const router = useRouter();
  const [method, setMethod] = useState(paymentMethods[0]?.method || "");
  const [details, setDetails] = useState("");
  const [address, setAddress] = useState(myAddress || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadySubmitted = myContract ? invoices.some((i) => i.person_id === personId && i.status !== "void") : false;
  const base = myContract?.baseAmount ?? null;
  const w9Required = base !== null && base >= w9Threshold;
  const w9Blocked = w9Required && !w9OnFile;
  const noAmount = myContract !== null && base === null;

  const selectedMethod = paymentMethods.find((m) => m.method === method);
  const needsDetails = selectedMethod && selectedMethod.method !== "check" && selectedMethod.method !== "cash";

  async function handleSubmit() {
    if (!myContract) return;
    setSubmitting(true); setError(null);
    const result = await submitInvoice({ contractId: myContract.id, paymentMethod: method, paymentDetails: details, payeeAddress: address });
    setSubmitting(false);
    if (result?.error) { setError(result.error); return; }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {!myContract ? (
        <div className="bg-card border border-bone rounded-card px-6 py-8 text-center">
          <p className="text-body-md text-ash">No signed contract for this production.</p>
          <p className="text-body-sm text-muted mt-1">
            An invoice can&apos;t be generated until your contract is fully signed. Once it is, your invoice will appear here.
          </p>
        </div>
      ) : alreadySubmitted ? (
        <div className="bg-confirmed/5 border border-confirmed/20 rounded-card px-4 py-3">
          <p className="text-body-sm text-ink">Your invoice has been submitted. You can see its status below.</p>
        </div>
      ) : (
        <div className="bg-card border border-bone rounded-card p-5">
          <h3 className="text-body-md font-medium text-ink mb-3">Submit Your Invoice</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            <div>
              <p className="text-body-xs text-muted">Bill to</p>
              <p className="text-body-sm text-ink">{myContract.billTo || "—"}</p>
            </div>
            <div>
              <p className="text-body-xs text-muted">Role</p>
              <p className="text-body-sm text-ink">{myContract.role_title}</p>
            </div>
            <div>
              <p className="text-body-xs text-muted">Amount (from your contract)</p>
              <p className="text-body-md font-semibold text-ink">{base !== null ? money(base) : "—"}</p>
            </div>
            <div>
              <p className="text-body-xs text-muted">On contract</p>
              <p className="text-body-sm text-ash">{myContract.compensation || "—"}</p>
            </div>
          </div>

          {noAmount ? (
            <p className="text-body-sm text-brick">Your contract doesn&apos;t list a payable dollar amount, so no invoice can be generated.</p>
          ) : w9Blocked ? (
            <div className="bg-tentative/10 border border-tentative/30 rounded-card px-4 py-3">
              <p className="text-body-sm text-ink">Payments of {money(w9Threshold)} or more need a W-9 on file before you can submit.</p>
              <p className="text-body-xs text-muted mt-1">Add your W-9 in your profile, then come back to submit.</p>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <label className="text-body-xs text-muted block mb-1">Your mailing address (appears on the invoice)</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, City, State ZIP"
                  className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick"
                />
              </div>
              <div className="mb-3">
                <label className="text-body-xs text-muted block mb-1">How would you like to be paid?</label>
                {paymentMethods.length === 0 ? (
                  <p className="text-body-sm text-ash">No payment methods are set up for this production yet.</p>
                ) : (
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick">
                    {paymentMethods.map((m) => <option key={m.method} value={m.method}>{m.label || m.method}</option>)}
                  </select>
                )}
              </div>
              {needsDetails && (
                <div className="mb-3">
                  <label className="text-body-xs text-muted block mb-1">{selectedMethod?.label || "Payment"} details (where should it go?)</label>
                  <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder={selectedMethod?.method === "cashapp" ? "$YourCashtag" : "Account / handle"} className="w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick" />
                </div>
              )}
              {w9Required && w9OnFile && <p className="text-body-xs text-confirmed mb-3">W-9 on file ✓ (required at {money(w9Threshold)}+)</p>}
              {error && <p className="text-body-sm text-brick mb-3">{error}</p>}
              <button onClick={handleSubmit} disabled={submitting || paymentMethods.length === 0 || !method} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors disabled:opacity-50">
                {submitting ? "Submitting…" : `Submit invoice for ${base !== null ? money(base) : ""}`}
              </button>
              <p className="text-body-xs text-muted mt-2">The amount is locked to your signed contract. Any approved stipend is added as a separate line.</p>
            </>
          )}
        </div>
      )}

      {invoices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-body-xs text-muted uppercase tracking-wider">{canManage ? "All invoices" : "Your invoices"}</p>
            {canManage && (
              <a
                href="/ledger-print"
                target="_blank"
                rel="noopener"
                className="text-body-xs font-medium text-brick hover:underline"
              >
                Export all as PDF →
              </a>
            )}
          </div>
          <div className="space-y-2">
            {invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} canManage={canManage} />)}
          </div>
        </div>
      )}

      <ReceiptsSection
        receipts={props.receipts}
        canManage={canManage}
        canSubmit={props.canSubmitReceipts}
        productionId={props.productionId}
        personId={personId}
      />

      {canManage && (
        <PaymentSettings
          orgId={props.orgId}
          productionId={props.productionId}
          productionTitle={props.productionTitle}
          defaultPayerId={props.defaultPayerId}
          payers={props.financePayers}
          methods={props.financeMethods}
        />
      )}
    </div>
  );
}
