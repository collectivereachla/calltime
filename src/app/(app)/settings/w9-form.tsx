"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileW9 } from "./w9-actions";
import { SignaturePad } from "../ledger/signature-pad";

const CLASSES: { key: string; label: string }[] = [
  { key: "individual", label: "Individual / sole proprietor" },
  { key: "c_corp", label: "C corporation" },
  { key: "s_corp", label: "S corporation" },
  { key: "partnership", label: "Partnership" },
  { key: "trust_estate", label: "Trust / estate" },
  { key: "llc", label: "Limited liability company (LLC)" },
  { key: "other", label: "Other" },
];

export function W9Form({ defaultName, onDone }: { defaultName?: string; onDone?: () => void }) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const field = "w-full px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick";
  const label = "text-body-xs text-muted block mb-1";

  const [name, setName] = useState(defaultName || "");
  const [businessName, setBusinessName] = useState("");
  const [classification, setClassification] = useState("individual");
  const [llcCode, setLlcCode] = useState("");
  const [otherText, setOtherText] = useState("");
  const [exemptPayeeCode, setExemptPayeeCode] = useState("");
  const [fatcaCode, setFatcaCode] = useState("");
  const [address, setAddress] = useState("");
  const [cityStateZip, setCityStateZip] = useState("");
  const [accountNumbers, setAccountNumbers] = useState("");
  const [tinType, setTinType] = useState<"ssn" | "ein">("ssn");
  const [tin, setTin] = useState("");
  const [taxYear, setTaxYear] = useState(currentYear);
  const [signatureName, setSignatureName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [certified, setCertified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    const res = await fileW9({
      name, businessName, classification, llcCode, otherText, exemptPayeeCode, fatcaCode,
      address, cityStateZip, accountNumbers, tinType, tin, signatureName,
      signatureImage, taxYear, certified,
    });
    setBusy(false);
    if (res?.error) { setMsg({ type: "error", text: res.error }); return; }
    setMsg({ type: "success", text: `W-9 completed and signed for ${res.year}.` });
    router.refresh();
    onDone?.();
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className={label}>1 — Name (as on your tax return)</label><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={label}>2 — Business name (if different, optional)</label><input className={field} value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></div>
      </div>

      <div>
        <label className={label}>3a — Federal tax classification</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {CLASSES.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 text-body-sm text-ink">
              <input type="radio" name="w9class" checked={classification === c.key} onChange={() => setClassification(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        {classification === "llc" && (
          <div className="mt-2 max-w-[220px]"><label className={label}>LLC tax classification (C, S, or P)</label>
            <input className={field} maxLength={1} value={llcCode} onChange={(e) => setLlcCode(e.target.value.toUpperCase())} /></div>
        )}
        {classification === "other" && (
          <div className="mt-2"><label className={label}>Describe</label><input className={field} value={otherText} onChange={(e) => setOtherText(e.target.value)} /></div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div><label className={label}>4 — Exempt payee code (if any)</label><input className={field} value={exemptPayeeCode} onChange={(e) => setExemptPayeeCode(e.target.value)} /></div>
        <div><label className={label}>4 — FATCA exemption code (if any)</label><input className={field} value={fatcaCode} onChange={(e) => setFatcaCode(e.target.value)} /></div>
      </div>

      <div><label className={label}>5 — Address (number, street, apt/suite)</label><input className={field} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className={label}>6 — City, state, and ZIP code</label><input className={field} value={cityStateZip} onChange={(e) => setCityStateZip(e.target.value)} /></div>
        <div><label className={label}>7 — Account numbers (optional)</label><input className={field} value={accountNumbers} onChange={(e) => setAccountNumbers(e.target.value)} /></div>
      </div>

      <div className="bg-bone/30 rounded-card p-3">
        <p className="text-body-xs font-medium text-ink mb-2">Part I — Taxpayer Identification Number (TIN)</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={label}>Type</label>
            <select className={field} value={tinType} onChange={(e) => setTinType(e.target.value as "ssn" | "ein")}>
              <option value="ssn">SSN</option>
              <option value="ein">EIN</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className={label}>{tinType === "ssn" ? "Social security number" : "Employer identification number"}</label>
            <input className={field} inputMode="numeric" placeholder={tinType === "ssn" ? "123-45-6789" : "12-3456789"} value={tin} onChange={(e) => setTin(e.target.value)} />
          </div>
          <div>
            <label className={label}>Tax year</label>
            <select className={field} value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
              {[currentYear, currentYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <p className="text-body-xs text-muted mt-2">Your SSN/EIN is written only into the generated W-9 PDF, stored privately for finance. It is never saved as plain data.</p>
      </div>

      <div className="border border-bone rounded-card p-3">
        <p className="text-body-xs font-medium text-ink mb-1">Part II — Certification</p>
        <p className="text-body-xs text-ash leading-relaxed">Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and (2) I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and (3) I am a U.S. citizen or other U.S. person; and (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.</p>
        <label className="flex items-start gap-2 mt-3 text-body-sm text-ink">
          <input type="checkbox" className="mt-1" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
          <span>I have read and agree to the certification above. (Cross out item 2 only if the IRS has notified you that you are currently subject to backup withholding — contact finance if so.)</span>
        </label>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div><label className={label}>Type your full legal name to sign</label><input className={field} value={signatureName} onChange={(e) => setSignatureName(e.target.value)} /></div>
          <div>
            <label className={label}>Or draw your signature (optional)</label>
            <SignaturePad onChange={setSignatureImage} height={110} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
          {busy ? "Submitting…" : "Sign & submit W-9"}
        </button>
        {onDone && <button onClick={onDone} className="text-body-sm text-ash hover:text-ink">Cancel</button>}
      </div>
      {msg && <p className={`text-body-xs ${msg.type === "success" ? "text-confirmed" : "text-brick"}`}>{msg.text}</p>}
    </div>
  );
}
