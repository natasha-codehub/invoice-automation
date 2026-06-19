/**
 * inputInvoices.js — bundles the real PDFs in /input at build time and pairs
 * each with a pre-baked extraction result + ground truth.
 *
 * These are genuine ESPRIGAS supplier invoices (Vern Lewis, Xpedited, Haun
 * Welding ×2). They exercise the messy patterns that separate the two AI layers:
 *   - OCR-layer ambiguity  → quantity columns, multi-page price lists, dual POs
 *   - post-extraction layer → vendor aliases, PO-format normalisation, variance,
 *                             goods-receipt lag
 *
 * Vite discovers /input/*.pdf statically (import.meta.glob), so the UI can show
 * "N invoices detected in /input" with zero backend. The bundled URLs are also
 * what the Native (Claude Vision) provider fetches when run for real.
 *
 * `extraction` = what a provider returns (the ExtractionResult contract).
 * `groundTruth` = the human-verified correct fields, used by the Phase 5
 *                 extraction-accuracy eval to settle "OCR vs normalisation".
 */

// ─── Vern Lewis Welding Supply — Invoice HS 16773 ───────────────────────────
// Quirks: cylinder size ("16cf"/"47cf") bleeds into the quantity column;
// no tax line; PO lives in the "Hardgoods PO #" field; a warranty acetylene
// line has qty but a blank amount. Vendor name is ALL-CAPS → alias normalised.
const VERN_LEWIS = {
  vendorRaw: 'VERN LEWIS WELDING SUPPLY',
  invoiceNumber: 'HS 16773',
  date: '5/15/2026',
  poNumber: '6528906-00',
  lineItems: [
    { desc: 'NITROGEN 16cf (NIT-20)',          qty: 1,  unit: 4.62,    total: 4.62   },
    { desc: 'NITROGEN 47cf (NIT-58)',          qty: 27, unit: 5.42,    total: 146.34 },
    { desc: 'OXYGEN 17cf (OXY-21)',            qty: 9,  unit: 4.46,    total: 40.14  },
    { desc: 'ACETYLENE, DISSOLVED (ACT-MC10)', qty: 16, unit: 15.972,  total: 255.55 },
    { desc: 'ACETYLENE, DISSOLVED (ACT-B40)',  qty: 2,  unit: 24.42,   total: 48.84  },
    { desc: 'ESPRI GAS DELIVERY FEE',          qty: 1,  unit: 12.00,   total: 12.00  },
    { desc: 'FUEL SURCHARGE',                  qty: 1,  unit: 5.00,    total: 5.00   },
    { desc: 'COMPLIANCE FEE',                  qty: 1,  unit: 4.50,    total: 4.50   },
  ],
  subtotal: 516.99,
  total: 516.99,
  currency: 'USD',
  goodsReceipt: true,
  duplicate: false,
  confidence: 0.71,
  fieldConfidence: { vendor: 0.62, invoiceNumber: 0.74, poNumber: 0.58, date: 0.69, subtotal: 0.82, total: 0.82 },
  warnings: [
    'Quantity column ambiguous — cylinder size ("16cf"/"47cf") overlaps the qty field; quantities inferred from amount ÷ unit price',
    'No tax line on document — tax check skipped',
    'PO number read from "Hardgoods PO #" field (no Gas PO present)',
    'Warranty acetylene line (ACT-MC10, 20.00 CYL) has qty but blank amount — excluded from totals',
  ],
  rawText: `VERN LEWIS WELDING SUPPLY            INVOICE HS 16773
Sold To: 7201563 ESPRI GAS            Date: 5/15/2026
Hardgoods PO #: 6528906-00   Ship Via: TM DELIVERY
NIT-20  NITROGEN 16cf                 4.6200      4.62
NIT-58  NITROGEN 47cf        27       5.4200    146.34
OXY-21  OXYGEN 17cf           9       4.4600     40.14
ACT-MC10 ACETYLENE, DISSOLVED 16     15.9720    255.55
ACT-B40  ACETYLENE, DISSOLVED  2     24.4200     48.84
03-ESPRIDELIVERY  ESPRI GAS DELIVERY FEE        12.00
03-FUEL SURCHARGE FUEL SURCHARGE                 5.00
SURCHARGE COMPLIANCE FEE                          4.50
                                  Sub Total     516.99
                                  Sales Total   516.99`,
};

// ─── Xpedited Gas — Invoice 11238 ───────────────────────────────────────────
// Quirks: TWO PO numbers (40392712 / 40392715); a 17-row price list where most
// rows are zero-qty; spans 2 pages. PO-of-record reconciles 3.03% over → tips
// to Human Review at 2% tolerance, Straight-Through at 5%.
const XPEDITED = {
  vendorRaw: 'Xpedited Gas',
  invoiceNumber: '11238',
  date: '5/13/26',
  poNumber: '40392712',
  poSecondary: '40392715',
  lineItems: [
    { desc: 'Oxygen 20 gas',     qty: 10, unit: 5.50,  total: 55.00  },
    { desc: 'Nitrogen 40 gas',   qty: 21, unit: 6.75,  total: 141.75 },
    { desc: 'Nitrogen 60 gas',   qty: 1,  unit: 9.35,  total: 9.35   },
    { desc: 'Acetylene MC gas',  qty: 13, unit: 14.00, total: 182.00 },
    { desc: 'Forklift propane',  qty: 1,  unit: 34.20, total: 34.20  },
    { desc: 'Delivery fee',      qty: 1,  unit: 16.50, total: 16.50  },
    { desc: 'Valve change',      qty: 2,  unit: 15.00, total: 30.00  },
  ],
  subtotal: 468.80,
  total: 468.80,
  currency: 'USD',
  goodsReceipt: true,
  duplicate: false,
  confidence: 0.64,
  fieldConfidence: { vendor: 0.70, invoiceNumber: 0.72, poNumber: 0.55, date: 0.60, subtotal: 0.83, total: 0.83 },
  warnings: [
    'Two PO numbers present (40392712 and 40392715) — reconciled against 40392712; second PO not allocated',
    '10 of 17 line rows are price-list entries with zero quantity — excluded',
    'Document spans 2 pages — totals taken from page 2 summary',
  ],
  rawText: `XPEDITED GAS  2338 IMMOKALEE ROAD, SUITE 219  NAPLES, FL 34110
INVOICE 11238   5/13/26   P.O 40392712  40392715
Bill To: R. E. Michael #002
Oxygen 20 gas        10   $5.50    $55.00
Nitrogen 40 gas      21   $6.75   $141.75
Nitrogen 60 gas       1   $9.35     $9.35
Acetylene MC gas     13  $14.00   $182.00
Forklift propane      1  $34.20    $34.20
Delivery fee          1  $16.50    $16.50
Valve change          2  $15.00    $30.00
                        Subtotal  $468.80
                        Total     $468.80`,
};

// ─── Haun Welding Supply (Scranton) — Invoice 0000828408 ────────────────────
// Quirks: partial shipment — 143 of 200 ordered shipped → goods receipt flagged
// not fully confirmed; $0 hazmat-handling line; QR remit code on document.
const HAUN_SCRANTON = {
  vendorRaw: 'Haun Welding Supply Inc',
  invoiceNumber: '0000828408',
  date: '05-29-26',
  poNumber: 'PO05032790',
  lineItems: [
    { desc: 'OXYGEN, USP SIZE E, 24 CF MZ (100~OXME)', qty: 143, unit: 3.75,  total: 536.25 },
    { desc: "HAZARDOUS MAT'L HANDLING CHG (008~M)",     qty: 1,   unit: 0.00,  total: 0.00   },
    { desc: 'DELIVERY CHARGE (008~DEL)',                qty: 1,   unit: 23.50, total: 23.50  },
  ],
  subtotal: 559.75,
  total: 559.75,
  currency: 'USD',
  goodsReceipt: false,
  duplicate: false,
  confidence: 0.82,
  fieldConfidence: { vendor: 0.88, invoiceNumber: 0.90, poNumber: 0.80, date: 0.78, subtotal: 0.90, total: 0.90 },
  warnings: [
    'Partial shipment — 143 CYL shipped of 200 ordered; goods receipt not fully confirmed',
    'Hazardous material handling line is $0.00 — verify it is intentionally waived',
    'QR "Pay now" remit code present on document — not parsed',
  ],
  rawText: `HAUN WELDING SUPPLY INC — Scranton Store
Invoice No.: 0000828408   Date: 05-29-26   Due: 06-28-26
BILL TO: ESPRIGAS / WELLPATH WAYMART PA
Customer P.O. No.: PO05032790   Terms: NET 30 DAYS
1 100~OXME OXYGEN, USP SIZE E, 24 CF MZ  Ordered 200  Shipped 143  3.7500  536.25
2 008~M  HAZARDOUS MAT'L HANDLING CHG     1   0.0000    0.00
3 008~DEL DELIVERY CHARGE                 1  23.5000   23.50
Sales Total: 559.75   Tax Total: 0.00   Total (USD): 559.75`,
};

// ─── Haun Welding Supply (Albany) — Invoice 0000828429 ──────────────────────
// Quirks: PO printed with a leading space / "P002" vs "PO02" ambiguity →
// normalised to canonical dashed form. Per-line customer part numbers.
const HAUN_ALBANY = {
  vendorRaw: 'Haun Welding Supply Inc',
  invoiceNumber: '0000828429',
  date: '05-29-26',
  poNumber: 'PO 02050543',
  lineItems: [
    { desc: 'NITROGEN 58 CF NI (100~NIT060)',                qty: 13, unit: 6.77,   total: 88.01 },
    { desc: 'OXYGEN GAS INDUSTRIAL 40CF OX (100~OXY040)',    qty: 2,  unit: 6.35,   total: 12.70 },
    { desc: 'ACETYLENE SIZE MC AC (100~ACEMC)',              qty: 3,  unit: 22.91,  total: 68.73 },
    { desc: 'PROPANE 33# (LIQUID) FORK-LIFT (100~PRO033)',   qty: 2,  unit: 28.185, total: 56.37 },
    { desc: "HAZARDOUS MAT'L HANDLING CHG (008~M)",          qty: 1,  unit: 0.00,   total: 0.00  },
    { desc: 'DELIVERY CHARGE (008~DEL)',                     qty: 1,  unit: 23.50,  total: 23.50 },
  ],
  subtotal: 249.31,
  total: 249.31,
  currency: 'USD',
  goodsReceipt: true,
  duplicate: false,
  confidence: 0.79,
  fieldConfidence: { vendor: 0.86, invoiceNumber: 0.88, poNumber: 0.60, date: 0.78, subtotal: 0.88, total: 0.88 },
  warnings: [
    'PO number ambiguous on document ("P002050543" with leading space — P002 vs PO02) — normalised to canonical form',
    'Per-line customer part numbers present (T060, Y040, O033) — captured in descriptions',
  ],
  rawText: `HAUN WELDING SUPPLY INC — Albany Store
Invoice No.: 0000828429   Date: 05-29-26   Due: 06-28-26
BILL TO: ESPRIGAS / BELL SIMONS LAGRANGEVILLE
Customer P.O. No.:  P002050543   Terms: NET 30 DAYS
1 100~NIT060 NITROGEN 58 CF NI   13  6.7700   88.01
2 100~OXY040 OXYGEN GAS INDUSTRIAL 40CF OX  2  6.3500  12.70
3 100~ACEMC  ACETYLENE SIZE MC AC  3  22.9100  68.73
4 100~PRO033 PROPANE 33# (LIQUID) FORK-LIFT  2  28.1850  56.37
5 008~M  HAZARDOUS MAT'L HANDLING CHG  1  0.0000  0.00
6 008~DEL DELIVERY CHARGE  1  23.5000  23.50
Sales Total: 249.31   Tax Total: 0.00   Total (USD): 249.31`,
};

// Human-verified correct fields per invoice (Phase 5 extraction-accuracy eval).
const BUNDLED = [
  {
    match: 'vernlewis',
    scenario: 'Vern Lewis — vendor alias (ALL-CAPS) → auto-corrected',
    extraction: VERN_LEWIS,
    groundTruth: { invoiceNumber: 'HS 16773', vendor: 'Vern Lewis Welding Supply', poNumber: '6528906-00', total: 516.99 },
  },
  {
    match: 'xpedited',
    scenario: 'Xpedited — dual PO, 3% variance → tolerance-sensitive',
    extraction: XPEDITED,
    groundTruth: { invoiceNumber: '11238', vendor: 'Xpedited Gas', poNumber: '40392712', total: 468.80 },
  },
  {
    match: 'haun_welding_01',
    scenario: 'Haun (Scranton) — partial shipment → human review',
    extraction: HAUN_SCRANTON,
    groundTruth: { invoiceNumber: '0000828408', vendor: 'Haun Welding Supply Inc', poNumber: 'PO05032790', total: 559.75 },
  },
  {
    match: 'haun_welding_02',
    scenario: 'Haun (Albany) — PO format normalised → auto-corrected',
    extraction: HAUN_ALBANY,
    groundTruth: { invoiceNumber: '0000828429', vendor: 'Haun Welding Supply Inc', poNumber: 'PO-02050543', total: 249.31 },
  },
];

// Vite bundles the real PDFs at build time → URLs + a static count, no backend.
const pdfModules = import.meta.glob('../../input/*.pdf', {
  eager: true,
  query: '?url',
  import: 'default',
});

function bundleFor(name) {
  const lower = name.toLowerCase();
  return BUNDLED.find(b => lower.includes(b.match)) || null;
}

// Files detected in /input, each joined to its bundled extraction (if known).
export const inputFiles = Object.entries(pdfModules)
  .map(([path, url]) => {
    const name = path.split(/[\\/]/).pop();
    const bundle = bundleFor(name);
    return {
      path,
      url,
      name,
      scenario: bundle?.scenario || 'Unmapped — extracts via filename heuristic',
      vendorPreview: bundle?.extraction.vendorRaw || null,
      totalPreview: bundle?.extraction.total ?? null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const inputFileCount = inputFiles.length;

/** Pre-baked extraction for a bundled invoice, matched by filename. */
export function getBundledExtraction(name) {
  const bundle = bundleFor(name || '');
  return bundle ? { ...bundle.extraction } : null;
}

export { BUNDLED };
