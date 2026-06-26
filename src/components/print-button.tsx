"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden shrink-0 px-3 py-1.5 text-body-xs font-medium rounded-card border border-bone text-ash hover:text-ink hover:border-ink transition-colors"
    >
      {label}
    </button>
  );
}
