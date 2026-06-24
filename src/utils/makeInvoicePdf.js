/**
 * makeInvoicePdf.js — turn an extraction into a genuine one-page PDF.
 *
 * Zero dependencies, runs in the browser: hand-assembles a minimal PDF 1.4 file
 * (catalog → pages → page → content stream) using the base-14 fonts (Helvetica
 * for labels, Courier for figures so amounts right-align on exact metrics — no
 * width table needed) and returns a `data:application/pdf;base64,…` URL that
 * feeds straight into the existing <iframe src={sourceUrl}> source viewer.
 *
 * Everything emitted is ASCII so `btoa` is safe and `Length` == string length.
 * Currency is written as "INR" rather than ₹ — Helvetica's default encoding has
 * no rupee glyph (the Phase G currency debt), and a real document shouldn't show
 * a tofu box.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // strip anything non-ASCII so the byte stream stays btoa-safe
    .replace(/[^\x20-\x7e]/g, '');

const money = (n) =>
  n == null
    ? '-'
    : 'INR ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Build the page content stream from the extracted fields.
// opts: { title, numberLabel, totalLabel } let the same layout render an invoice,
// a purchase order or a credit note (just different headings / labels).
function buildContent(ext, opts = {}) {
  const { title = 'TAX INVOICE', numberLabel = 'Invoice No.', totalLabel = 'Amount Due' } = opts;
  const L = 50;
  const R = 545;
  const ops = [];

  const T = (x, y, size, font, str) =>
    ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${esc(str)}) Tj ET`);
  // Right-align using Courier's fixed 600/1000-em advance (only used with F3/F4).
  const Tr = (xRight, y, size, font, str) => {
    const w = String(str).length * size * 0.6;
    T(xRight - w, y, size, font, str);
  };
  const rule = (y, lw, g) =>
    ops.push(`${g} G ${lw} w ${L} ${y.toFixed(1)} m ${R} ${y.toFixed(1)} l S`);

  let y = 800;

  // ── Header ────────────────────────────────────────────────────────────────
  T(L, y, 20, 'F2', ext.vendorRaw || 'Unknown Vendor');
  Tr(R, y + 4, 9, 'F1', title);
  y -= 8;
  // indigo accent rule (matches the app identity)
  ops.push(`0.31 0.27 0.9 RG 2 w ${L} ${y.toFixed(1)} m ${R} ${y.toFixed(1)} l S`);
  y -= 28;

  // ── Meta block ──────────────────────────────────────────────────────────────
  const metaRows = [
    [numberLabel, ext.invoiceNumber || '-'],
    ['Date', ext.date || '-'],
  ];
  // Only show a PO Reference line when one is present (an invoice with a PO);
  // POs and non-PO invoices skip it.
  if (ext.poNumber) metaRows.push(['PO Reference', ext.poNumber]);
  metaRows.forEach(([k, v]) => {
    T(L, y, 10, 'F1', k);
    T(L + 110, y, 10, 'F2', v);
    y -= 16;
  });
  y -= 12;

  // ── Line-item table ──────────────────────────────────────────────────────────
  const cQty = 350;
  const cUnit = 450;
  T(L, y, 9, 'F2', 'DESCRIPTION');
  Tr(cQty, y, 9, 'F2', 'QTY');
  Tr(cUnit, y, 9, 'F2', 'UNIT');
  Tr(R, y, 9, 'F2', 'AMOUNT');
  y -= 6;
  rule(y, 0.8, 0.6);
  y -= 16;

  for (const li of ext.lineItems || []) {
    T(L, y, 10, 'F1', li.desc || '');
    Tr(cQty, y, 10, 'F3', String(li.qty ?? ''));
    Tr(cUnit, y, 10, 'F3', money(li.unit));
    Tr(R, y, 10, 'F3', money(li.total));
    y -= 16;
  }
  y -= 4;
  rule(y, 0.8, 0.6);
  y -= 22;

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalRow = (k, v, bold) => {
    T(370, y, 10, bold ? 'F2' : 'F1', k);
    Tr(R, y, 10, bold ? 'F4' : 'F3', money(v));
    y -= 16;
  };
  totalRow('Subtotal', ext.subtotal);
  if (ext.tax != null) totalRow('Tax', ext.tax);
  rule(y + 8, 0.8, 0.6);
  totalRow(totalLabel, ext.total, true);

  // ── Footer ─────────────────────────────────────────────────────────────────
  T(L, 42, 8, 'F1', 'Generated from extraction - invoice-automation prototype');

  return ops.join('\n');
}

/**
 * invoicePdfDataUrl(ext, opts) → "data:application/pdf;base64,…" for a one-page
 * document. opts: { title, numberLabel, totalLabel } to render an invoice (default),
 * a purchase order, or a credit note from the same layout.
 */
export function invoicePdfDataUrl(ext, opts = {}) {
  const content = buildContent(ext, opts);
  const objects = [
    '<</Type /Catalog /Pages 2 0 R>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    '<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources <</Font <</F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R>>>> /Contents 4 0 R>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Courier>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Courier-Bold>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;

  return 'data:application/pdf;base64,' + btoa(pdf);
}
