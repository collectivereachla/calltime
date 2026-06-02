"use client";
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden px-4 py-2 text-sm font-medium rounded-lg bg-black text-white hover:bg-black/90"
    >
      Print / Save as PDF
    </button>
  );
}
