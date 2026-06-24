import { approvedVendors, openPOs } from '../data/vendorMaster.js';

// ─── Vendor alias map ────────────────────────────────────────────────────────
const VENDOR_ALIASES = {
  "Microsoft Corp":          "Microsoft Corporation",
  "Microsoft Corp.":         "Microsoft Corporation",
  "MS Corporation":          "Microsoft Corporation",
  "Adobe Inc":               "Adobe Systems Inc",
  "Adobe Inc.":              "Adobe Systems Inc",
  "Adobe":                   "Adobe Systems Inc",
  "Salesforce":              "Salesforce Inc",
  "Salesforce.com":          "Salesforce Inc",
  "Amazon Web Services":     "AWS Inc",
  "Amazon AWS":              "AWS Inc",
  "Zoom":                    "Zoom Video Communications",
  "Zoom Communications":     "Zoom Video Communications",
  "Matheson":                "Matheson Tri-Gas Inc",
  "Matheson Tri-Gas":        "Matheson Tri-Gas Inc",
  "Matheson TriGas":         "Matheson Tri-Gas Inc",
  "Sharpgas":                "Sharpgas Inc",
  "Sharp Gas":               "Sharpgas Inc",
  "Acme Supplies":           "Acme Supplies Ltd",
  "Acme":                    "Acme Supplies Ltd",
  // Real /input batch — supplier name variants seen on the documents
  "VERN LEWIS WELDING SUPPLY": "Vern Lewis Welding Supply",
  "Vern Lewis":                "Vern Lewis Welding Supply",
  "Vern Lewis Welding":        "Vern Lewis Welding Supply",
  "Xpedited":                  "Xpedited Gas",
  "Haun Welding":              "Haun Welding Supply Inc",
  "Haun Welding Supply":       "Haun Welding Supply Inc",
};

// ─── Jurisdiction ────────────────────────────────────────────────────────────
// Where the invoice was issued, so the tax check applies the right regime.
// Explicit `currency` wins; otherwise sniff the raw document ("(USD)" / "$" → US),
// defaulting to India (the original sample set is INR/GST).
function inferJurisdiction(inv) {
  const cur = (inv.currency || '').toUpperCase();
  if (cur === 'USD' || cur === 'US') return 'US';
  if (cur === 'INR' || cur === 'IN') return 'IN';
  if (/\(USD\)|\bUSD\b|\$/.test(inv.rawText || '')) return 'US';
  return 'IN';
}

// ─── Normalisation ───────────────────────────────────────────────────────────
function normalise(invoice) {
  const corrections = [];
  const corrected = { ...invoice };

  // 1. Vendor alias
  const rawVendor = (corrected.vendorName || '').trim();
  if (VENDOR_ALIASES[rawVendor]) {
    corrected.vendorName = VENDOR_ALIASES[rawVendor];
    corrections.push(`Vendor name corrected: "${rawVendor}" → "${corrected.vendorName}"`);
  }

  // 2. PO number: spaces/underscores → dashes, uppercase
  if (corrected.poNumber) {
    const rawPO = corrected.poNumber;
    const normPO = rawPO.replace(/[\s_]+/g, '-').toUpperCase();
    if (normPO !== rawPO) {
      corrected.poNumber = normPO;
      corrections.push(`PO number normalised: "${rawPO}" → "${normPO}"`);
    }
  }

  // 3. Date: DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD
  if (corrected.date) {
    const rawDate = corrected.date;
    const ddmmyyyy = rawDate.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      corrected.date = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
      corrections.push(`Date normalised: "${rawDate}" → "${corrected.date}"`);
    }
  }

  return { corrected, corrections };
}

// ─── Validation checks ───────────────────────────────────────────────────────
export function validateInvoice(invoice, tolerancePercent = 2) {
  const { corrected, corrections } = normalise(invoice);

  // Currency symbol follows the jurisdiction (US → $, IN → ₹) so every check
  // message reads in the document's own currency.
  const jurisdiction = inferJurisdiction(corrected);
  const sym = jurisdiction === 'IN' ? '₹' : '$';

  const checks = [];

  // CHECK 1 — MANDATORY FIELDS [FATAL]
  const missingFields = [];
  if (!corrected.invoiceNumber) missingFields.push('invoice number');
  if (!corrected.poNumber)      missingFields.push('PO number');
  if (!corrected.vendorName)    missingFields.push('vendor name');
  if (!corrected.lineItems || corrected.lineItems.length === 0) missingFields.push('line items');
  const mandatoryPassed = missingFields.length === 0;
  checks.push({
    id: 'MANDATORY_FIELDS',
    label: 'Mandatory Fields',
    passed: mandatoryPassed,
    fatal: true,
    detail: mandatoryPassed
      ? 'All required fields present'
      : `Missing: ${missingFields.join(', ')}`,
  });

  // CHECK 2 — VENDOR MASTER [FATAL]
  const vendorKnown = approvedVendors.includes(corrected.vendorName || '');
  checks.push({
    id: 'VENDOR_MASTER',
    label: 'Vendor Master',
    passed: vendorKnown,
    fatal: true,
    detail: vendorKnown
      ? `"${corrected.vendorName}" is an approved vendor`
      : `"${corrected.vendorName || '(blank)'}" not found in approved vendor list`,
  });

  // CHECK 3 — PO MATCH [FATAL]
  const matchedPO = corrected.poNumber ? openPOs[corrected.poNumber] : null;
  checks.push({
    id: 'PO_MATCH',
    label: 'PO Match',
    passed: !!matchedPO,
    fatal: true,
    detail: matchedPO
      ? `PO ${corrected.poNumber} found — amount ${sym}${matchedPO.amount.toLocaleString()}`
      : `PO "${corrected.poNumber || '(blank)'}" not found in open PO list`,
  });

  // CHECK 4 — LINE ITEM RECONCILIATION [SOFT]
  let lineRecPassed = true;
  let lineRecDetail = 'No PO to reconcile against';
  if (matchedPO && corrected.lineItems && corrected.lineItems.length > 0) {
    const invoiceTotal = corrected.lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const poAmount = matchedPO.amount;
    const variancePct = Math.abs((invoiceTotal - poAmount) / poAmount) * 100;
    lineRecPassed = variancePct <= tolerancePercent;
    lineRecDetail = lineRecPassed
      ? `Invoice total ${sym}${invoiceTotal.toLocaleString()} within ${tolerancePercent}% of PO ${sym}${poAmount.toLocaleString()} (variance ${variancePct.toFixed(2)}%)`
      : `Invoice total ${sym}${invoiceTotal.toLocaleString()} vs PO ${sym}${poAmount.toLocaleString()} — variance ${variancePct.toFixed(2)}% exceeds ${tolerancePercent}% threshold`;
  }
  checks.push({
    id: 'LINE_ITEM_RECONCILIATION',
    label: 'Line Item Reconciliation',
    passed: lineRecPassed,
    fatal: false,
    detail: lineRecDetail,
  });

  // CHECK 5 — TAX COMPLIANCE [SOFT] — jurisdiction-aware (Builder's Manual C6)
  // The old check assumed Indian GST 18% on every invoice, which false-flagged the
  // USD gas invoices (no GST line). Now we branch on jurisdiction: India → 18% GST;
  // US → sales tax, where industrial gas bought for resale is typically exempt, so
  // a $0/absent tax line is expected, not a violation.
  let taxPassed = true;
  let taxLabel = 'Tax Compliance';
  let taxDetail = 'Tax not provided';
  if (jurisdiction === 'IN') {
    taxLabel = 'Tax Compliance (GST 18%)';
    if (corrected.subtotal !== undefined && corrected.tax !== undefined) {
      const expectedTax = corrected.subtotal * 0.18;
      const taxDiff = Math.abs(corrected.tax - expectedTax);
      taxPassed = taxDiff <= 1;
      taxDetail = taxPassed
        ? `Tax ${sym}${corrected.tax} matches 18% GST of subtotal ${sym}${corrected.subtotal} (expected ${sym}${expectedTax.toFixed(2)})`
        : `Tax ${sym}${corrected.tax} ≠ expected ${sym}${expectedTax.toFixed(2)} (18% GST of ${sym}${corrected.subtotal}) — difference ${sym}${taxDiff.toFixed(2)}`;
    } else {
      taxDetail = 'GST not provided on document';
    }
  } else {
    // US sales tax. Gas-for-resale is exempt; $0 / no tax line is the expected case.
    taxLabel = 'Tax Compliance (US sales tax)';
    const tax = corrected.tax || 0;
    taxPassed = true; // never false-reject on an expected exemption
    taxDetail = tax === 0
      ? `US sales tax ${sym}0.00 — consistent with industrial-gas resale exemption`
      : `US sales tax ${sym}${tax} present — verify taxability for this jurisdiction`;
  }
  checks.push({
    id: 'TAX_COMPLIANCE',
    label: taxLabel,
    passed: taxPassed,
    fatal: false,
    detail: taxDetail,
  });

  // CHECK 6 — DUPLICATE CHECK [FATAL]
  const isDuplicate = corrected.duplicate === true;
  checks.push({
    id: 'DUPLICATE_CHECK',
    label: 'Duplicate Check',
    passed: !isDuplicate,
    fatal: true,
    detail: isDuplicate
      ? `Invoice ${corrected.invoiceNumber} is flagged as a duplicate`
      : 'No duplicate detected',
  });

  // CHECK 7 — GOODS RECEIPT [SOFT]
  // goodsReceipt: false means goods have not been confirmed received (lag)
  const grPassed = corrected.goodsReceipt !== false;
  checks.push({
    id: 'GOODS_RECEIPT',
    label: 'Goods Receipt Confirmation',
    passed: grPassed,
    fatal: false,
    detail: grPassed
      ? 'Goods receipt confirmed'
      : 'Goods receipt not yet confirmed — possible delivery lag',
  });

  return {
    checks,
    corrections,
    normalisedVendor: corrected.vendorName || '',
    normalisedPO: corrected.poNumber || '',
    correctedInvoice: corrected,
  };
}
