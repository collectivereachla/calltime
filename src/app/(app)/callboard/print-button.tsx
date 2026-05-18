"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden px-3 py-1.5 text-body-xs text-ash border border-bone rounded-card hover:text-ink hover:border-ash transition-colors"
    >
      ⎙ Print
    </button>
  );
}
