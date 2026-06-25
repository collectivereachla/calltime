// Phone helpers. Members must enter a full 10-digit US number; we store it
// canonically as 000.000.0000. A leading country code "1" is accepted and
// dropped. Empty input is allowed (phone is optional); anything that isn't a
// complete 10-digit number is rejected so we never store partial numbers.
export function normalizePhone(
  raw: string | null | undefined
): { ok: boolean; value: string | null; error?: string } {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) {
    return { ok: false, value: null, error: "Enter a full 10-digit phone number." };
  }
  return { ok: true, value: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}` };
}
