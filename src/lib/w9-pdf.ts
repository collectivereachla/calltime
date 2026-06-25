import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface W9Fields {
  name: string;                 // Line 1
  businessName?: string;        // Line 2
  classification: string;       // individual|c_corp|s_corp|partnership|trust_estate|llc|other
  llcCode?: string;             // C|S|P when classification=llc
  otherText?: string;           // when classification=other
  exemptPayeeCode?: string;     // Line 4
  fatcaCode?: string;           // Line 4
  address: string;              // Line 5
  cityStateZip: string;         // Line 6
  accountNumbers?: string;      // Line 7
  tinType: "ssn" | "ein";
  tin: string;                  // 9 digits
  signatureName: string;        // typed legal name
  signatureImage?: string | null; // optional drawn PNG dataURL
  signedDate: string;           // e.g. 2026-06-25
  orgName: string;
  signerIp?: string | null;
}

const CLASS_LABELS: Record<string, string> = {
  individual: "Individual/sole proprietor",
  c_corp: "C corporation",
  s_corp: "S corporation",
  partnership: "Partnership",
  trust_estate: "Trust/estate",
  llc: "Limited liability company",
  other: "Other",
};

function fmtTin(type: "ssn" | "ein", d: string): string {
  const x = (d || "").replace(/\D/g, "");
  if (type === "ssn") return `${x.slice(0, 3)}-${x.slice(3, 5)}-${x.slice(5, 9)}`;
  return `${x.slice(0, 2)}-${x.slice(2, 9)}`;
}

export async function generateW9Pdf(f: W9Fields): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 54;
  const RIGHT = 612 - M;
  let y = 792 - 54;

  const black = rgb(0, 0, 0);
  const gray = rgb(0.35, 0.35, 0.35);

  function text(s: string, x: number, yy: number, size = 9, font = helv, color = black) {
    page.drawText(s, { x, y: yy, size, font, color });
  }
  function line(x1: number, yy: number, x2: number) {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: gray });
  }
  // word-wrap helper; returns new y
  function wrap(s: string, x: number, yy: number, maxW: number, size = 8.5, font = helv, lh = 11): number {
    const words = s.split(/\s+/);
    let lineStr = "";
    for (const w of words) {
      const test = lineStr ? lineStr + " " + w : w;
      if (font.widthOfTextAtSize(test, size) > maxW && lineStr) {
        text(lineStr, x, yy, size, font); yy -= lh; lineStr = w;
      } else lineStr = test;
    }
    if (lineStr) { text(lineStr, x, yy, size, font); yy -= lh; }
    return yy;
  }
  function box(x: number, yy: number, checked: boolean) {
    page.drawRectangle({ x, y: yy, width: 9, height: 9, borderColor: black, borderWidth: 0.8 });
    if (checked) {
      page.drawLine({ start: { x: x + 1.5, y: yy + 1.5 }, end: { x: x + 7.5, y: yy + 7.5 }, thickness: 1, color: black });
      page.drawLine({ start: { x: x + 7.5, y: yy + 1.5 }, end: { x: x + 1.5, y: yy + 7.5 }, thickness: 1, color: black });
    }
  }

  // Header
  text("Form W-9 (Substitute)", M, y, 14, bold); 
  text("Rev. March 2024", RIGHT - 70, y, 8, helv, gray);
  y -= 14;
  text("Request for Taxpayer Identification Number and Certification", M, y, 9.5, helv);
  y -= 12;
  text("Give form to the requester. Do not send to the IRS.", M, y, 8, helv, gray);
  y -= 18; line(M, y, RIGHT); y -= 16;

  // Line 1
  text("1  Name of entity/individual", M, y, 8, bold); y -= 12;
  text(f.name, M + 6, y, 10); line(M, y - 3, RIGHT); y -= 18;
  // Line 2
  text("2  Business name/disregarded entity name, if different from above", M, y, 8, bold); y -= 12;
  text(f.businessName || "", M + 6, y, 10); line(M, y - 3, RIGHT); y -= 18;

  // Line 3a classification
  text("3a  Federal tax classification (check one)", M, y, 8, bold); y -= 13;
  const order = ["individual", "c_corp", "s_corp", "partnership", "trust_estate", "llc", "other"];
  let cx = M + 6;
  for (const k of order) {
    box(cx, y - 1, f.classification === k);
    const label = CLASS_LABELS[k];
    text(label, cx + 13, y, 8);
    cx += 16 + helv.widthOfTextAtSize(label, 8) + 14;
    if (cx > RIGHT - 90) { cx = M + 6; y -= 14; }
  }
  y -= 14;
  if (f.classification === "llc") { text(`LLC tax classification (C/S/P): ${f.llcCode || ""}`, M + 6, y, 8); y -= 13; }
  if (f.classification === "other") { text(`Other: ${f.otherText || ""}`, M + 6, y, 8); y -= 13; }

  // Line 4 exemptions
  text(`4  Exempt payee code (if any): ${f.exemptPayeeCode || "—"}     FATCA exemption code (if any): ${f.fatcaCode || "—"}`, M, y, 8); y -= 16;

  // Line 5 / 6 address
  text("5  Address (number, street, and apt. or suite no.)", M, y, 8, bold); y -= 12;
  text(f.address, M + 6, y, 10); line(M, y - 3, RIGHT); y -= 18;
  text("6  City, state, and ZIP code", M, y, 8, bold); y -= 12;
  text(f.cityStateZip, M + 6, y, 10); line(M, y - 3, RIGHT); y -= 18;
  // Line 7
  text("7  List account number(s) here (optional)", M, y, 8, bold); y -= 12;
  text(f.accountNumbers || "", M + 6, y, 10); line(M, y - 3, RIGHT); y -= 20;

  // Part I TIN
  line(M, y, RIGHT); y -= 14;
  text("Part I   Taxpayer Identification Number (TIN)", M, y, 9.5, bold); y -= 14;
  const tinLabel = f.tinType === "ssn" ? "Social security number" : "Employer identification number";
  text(`${tinLabel}:`, M + 6, y, 9);
  text(fmtTin(f.tinType, f.tin), M + 6 + helv.widthOfTextAtSize(`${tinLabel}: `, 9) + 6, y, 11, bold);
  y -= 20;

  // Part II Certification (verbatim)
  line(M, y, RIGHT); y -= 14;
  text("Part II   Certification", M, y, 9.5, bold); y -= 13;
  text("Under penalties of perjury, I certify that:", M + 6, y, 8.5, bold); y -= 12;
  const items = [
    "1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and",
    "2. I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and",
    "3. I am a U.S. citizen or other U.S. person (defined below); and",
    "4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.",
  ];
  for (const it of items) { y = wrap(it, M + 6, y, RIGHT - M - 12, 8.5, helv, 11); y -= 1; }
  y -= 2;
  y = wrap("Certification instructions. You must cross out item 2 above if you have been notified by the IRS that you are currently subject to backup withholding because you have failed to report all interest and dividends on your tax return. For real estate transactions, item 2 does not apply.", M + 6, y, RIGHT - M - 12, 7.5, helv, 10);
  y -= 14;

  // Signature
  line(M, y, RIGHT); y -= 16;
  text("Sign Here", M, y, 8, bold); y -= 4;
  if (f.signatureImage && f.signatureImage.startsWith("data:image/png")) {
    try {
      const png = await doc.embedPng(f.signatureImage);
      const w = 150, h = (png.height / png.width) * w;
      page.drawImage(png, { x: M + 60, y: y - h + 6, width: w, height: Math.min(h, 40) });
    } catch { /* fall back to typed */ }
  }
  text(`/s/ ${f.signatureName}`, M + 60, y - 12, 11, bold);
  line(M + 55, y - 16, M + 320);
  text("Signature of U.S. person", M + 55, y - 26, 7.5, helv, gray);
  text(f.signedDate, M + 360, y - 12, 10);
  line(M + 355, y - 16, RIGHT);
  text("Date", M + 355, y - 26, 7.5, helv, gray);
  y -= 44;

  // Audit footer
  line(M, y, RIGHT); y -= 12;
  const stamp = `Completed and electronically signed via Calltime for ${f.orgName} on ${f.signedDate}${f.signerIp ? ` from IP ${f.signerIp}` : ""}. Substitute Form W-9, retained by the requester; not transmitted to the IRS.`;
  wrap(stamp, M, y, RIGHT - M, 7, helv, 9);

  return await doc.save();
}
