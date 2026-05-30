"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { submitW9 } from "./w9-actions";

export function W9Card({
  w9TaxYear,
  submittedAt,
}: {
  w9TaxYear: number | null;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const onFileCurrent = w9TaxYear !== null && w9TaxYear >= currentYear;

  const [year, setYear] = useState(currentYear);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg({ type: "error", text: "Choose your completed W-9 PDF first." }); return; }
    if (file.type !== "application/pdf") { setMsg({ type: "error", text: "Please upload a PDF." }); return; }
    setBusy(true); setMsg(null);
    const base64: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error("Couldn't read the file."));
      r.readAsDataURL(file);
    });
    const result = await submitW9(base64, year);
    setBusy(false);
    if (result?.error) { setMsg({ type: "error", text: result.error }); return; }
    setMsg({ type: "success", text: `W-9 saved for ${result.year}.` });
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="mt-10 pt-8 border-t border-bone">
      <h2 className="text-body-lg font-medium text-ink">Tax Form (W-9)</h2>
      <p className="text-body-sm text-ash mt-1 mb-4">
        Required before you can be paid {/* threshold mentioned in Ledger */}at or above the reporting threshold.
        Your W-9 is stored privately and is only visible to your organization&apos;s finance admins.
      </p>

      <div className="bg-card border border-bone rounded-card p-4">
        <p className="text-body-sm mb-3">
          {onFileCurrent ? (
            <span className="text-confirmed">On file for {w9TaxYear} ✓</span>
          ) : w9TaxYear !== null ? (
            <span className="text-tentative">Last on file: {w9TaxYear} — please upload a current one.</span>
          ) : (
            <span className="text-ash">Not on file yet.</span>
          )}
          {submittedAt && onFileCurrent && (
            <span className="text-muted"> (uploaded {new Date(submittedAt).toLocaleDateString()})</span>
          )}
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-body-xs text-muted block mb-1">Tax year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 text-body-sm rounded border border-bone bg-paper text-ink focus:outline-none focus:border-brick"
            >
              {[currentYear, currentYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-body-xs text-muted block mb-1">Completed W-9 (PDF)</label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="block w-full text-body-xs text-ash file:mr-3 file:px-3 file:py-1.5 file:rounded-card file:border-0 file:bg-ink file:text-paper file:text-body-xs hover:file:bg-ink/90"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={busy}
            className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload W-9"}
          </button>
        </div>

        {msg && (
          <p className={`text-body-xs mt-2 ${msg.type === "success" ? "text-confirmed" : "text-brick"}`}>{msg.text}</p>
        )}

        <p className="text-body-xs text-muted mt-3">
          Need the form? Download the blank W-9 from irs.gov, fill and sign it, then upload the PDF here.
        </p>
      </div>
    </div>
  );
}
