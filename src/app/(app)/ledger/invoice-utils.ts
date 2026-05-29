// Pull the first clean dollar figure out of a free-text compensation string,
// e.g. "$150 (with possible stipend)" -> 150. Returns null when there's no
// readable amount (e.g. "Volunteer"), which blocks invoice generation.
export function parseCompensationAmount(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}
