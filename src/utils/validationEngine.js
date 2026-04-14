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
};

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
      ? `PO ${corrected.poNumber} found — amount ₹${matchedPO.amount.toLocaleString()}`
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
      ? `Invoice total ₹${invoiceTotal.toLocaleString()} within ${tolerancePercent}% of PO ₹${poAmount.toLocaleString()} (variance ${variancePct.toFixed(2)}%)`
      : `Invoice total ₹${invoiceTotal.toLocaleString()} vs PO ₹${poAmount.toLocaleString()} — variance ${variancePct.toFixed(2)}% exceeds ${tolerancePercent}% threshold`;
  }
  checks.push({
    id: 'LINE_ITEM_RECONCILIATION',
    label: 'Line Item Reconciliation',
    passed: lineRecPassed,
    fatal: false,
    detail: lineRecDetail,
  });

  // CHECK 5 — TAX COMPLIANCE [SOFT]
  let taxPassed = true;
  let taxDetail = 'Tax not provided';
  if (corrected.subtotal !== undefined && corrected.tax !== undefined) {
    const expectedTax = corrected.subtotal * 0.18;
    const taxDiff = Math.abs(corrected.tax - expectedTax);
    taxPassed = taxDiff <= 1;
    taxDetail = taxPassed
      ? `Tax ₹${corrected.tax} matches 18% of subtotal ₹${corrected.subtotal} (expected ₹${expectedTax.toFixed(2)})`
      : `Tax ₹${corrected.tax} ≠ expected ₹${expectedTax.toFixed(2)} (18% of ₹${corrected.subtotal}) — difference ₹${taxDiff.toFixed(2)}`;
  }
  checks.push({
    id: 'TAX_COMPLIANCE',
    label: 'Tax Compliance (GST 18%)',
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
