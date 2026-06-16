"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90"
    >
      Print / Save as PDF
    </button>
  );
}
