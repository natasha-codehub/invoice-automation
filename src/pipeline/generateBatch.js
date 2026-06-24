/**
 * generateBatch.js — build a mock intake batch (Builder's Manual A7).
 *
 * Real depth + synthetic scale: the 12 real invoices (8 samples + 4 bundled
 * ESPRIGAS PDFs) run through the actual engine so they're fully inspectable in
 * the stepper; the rest are lightweight synthetic invoices so the funnel and the
 * (virtualized) worklist demonstrate 1,000+ scale.
 */

import { sampleInvoices } from '../data/invoices.js';
import { BUNDLED, inputFiles } from '../data/inputInvoices.js';
import { OTHER_DOCS } from '../data/otherDocs.js';
import { invoicePdfDataUrl } from '../utils/makeInvoicePdf.js';
import { checkConsistency } from './consistency.js';
import { runPipeline } from './runPipeline.js';
import { aggregateBatch } from './aggregateBatch.js';
import { STATUS, STAGES, mkStage, deriveOverall, TOUCHLESS } from './model.js';

const round2 = (x) => Math.round(x * 100) / 100;

// Seeded PRNG (mulberry32) so the synthetic fill is DETERMINISTIC: the batch —
// and therefore every headline KPI (STP %, needs-review, failed) — is identical
// on every page load. Without this the counts wobble on each refresh, which reads
// as a bug mid-demo.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

const SYNTH_VENDORS = [
  'Airgas USA LLC', 'Linde Gas & Equipment', 'Praxair Distribution', 'Norco Inc',
  'nexAir LLC', 'Roberts Oxygen', 'WestAir Gases', 'Matheson Tri-Gas Inc',
  'Vern Lewis Welding Supply', 'Haun Welding Supply Inc', 'Xpedited Gas', 'Sharpgas Inc',
];

// The 4 bundled ESPRIGAS invoices as engine-ready invoice objects.
export function bundledInvoices() {
  return BUNDLED.map((b) => {
    const file = inputFiles.find((f) => f.name.toLowerCase().includes(b.match));
    return {
      ...b.extraction,
      id: `INV-${b.match.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      invoiceNumber: b.extraction.invoiceNumber,
      vendorName: b.extraction.vendorRaw,
      scenario: b.scenario,
      extractionEngine: 'Demo',
      extractionEngineId: 'demo',
      sourceUrl: file?.url || null,
      sourceFile: file?.name || null,
      // The bundled ESPRIGAS files are real scanned PDFs → float to the very top.
      sourceKind: 'native',
      docType: 'invoice_po', // PO-backed gas-supply invoices (three-way match)
    };
  });
}

// Relabel the 8 scenario samples into the document types AP teams actually see,
// so the Type column shows real variety with no new data: subscriptions (SaaS),
// PO-backed invoices, and non-PO/services invoices.
const SAMPLE_DOC_TYPE = {
  'INV-001': 'invoice_po',    // Acme — clean PO-backed invoice
  'INV-002': 'subscription',  // Microsoft 365
  'INV-003': 'invoice_po',    // AWS — PO-format normalisation
  'INV-004': 'subscription',  // Adobe Creative Cloud
  'INV-005': 'subscription',  // Zoom seats
  'INV-006': 'subscription',  // Salesforce CRM
  'INV-007': 'invoice_nonpo', // Phantom — consulting services, no PO match
  'INV-008': 'invoice_nonpo', // Oracle — license, missing PO
};

// Per-field confidence so the Extract inspector reads like real OCR output:
// a present field extracts with high confidence, a missing one (Oracle's blank
// invoice #/PO) is flagged low — the same weak-field signal a real engine emits.
function sampleFieldConfidence(s) {
  const c = (v, hi) => (v == null || v === '' ? 0.24 : hi);
  return {
    vendor: c(s.vendorName, 0.95),
    invoiceNumber: c(s.invoiceNumber, 0.97),
    poNumber: c(s.poNumber, 0.92),
    date: c(s.date, 0.96),
    subtotal: c(s.subtotal, 0.95),
    total: c(s.total, 0.98),
  };
}

// The 8 scenario samples ship no source file. We (a) render a real one-page PDF
// from each one's fields so the source viewer shows an actual document instead of
// the HTML "reconstructed from extraction" fallback, and (b) give them a full
// extraction shape (vendorRaw + overall/field confidence) so they're genuinely
// inspectable in the Extract stage — the "real depth" the 12 invoices promise.
// Overall confidence stays ≥ 0.75 so Extract still flows on; the scenarios still
// branch at Validate & Map exactly as before.
export function sampleInvoicesWithSource() {
  return sampleInvoices.map((s) => ({
    ...s,
    vendorRaw: s.vendorName,
    currency: 'USD', // USD shop → US jurisdiction (no GST label on these invoices)
    confidence: 0.92,
    fieldConfidence: sampleFieldConfidence(s),
    extractionEngine: 'Demo',
    extractionEngineId: 'demo',
    sourceUrl: invoicePdfDataUrl({
      vendorRaw: s.vendorName,
      invoiceNumber: s.invoiceNumber,
      poNumber: s.poNumber,
      date: s.date,
      lineItems: s.lineItems,
      subtotal: s.subtotal,
      tax: s.tax,
      total: s.total,
    }),
    sourceFile: `${s.id}.pdf`,
    sourceKind: 'generated',
    docType: SAMPLE_DOC_TYPE[s.id] || 'invoice_po',
  }));
}

// Reference documents (PO, credit note): read & extracted like anything else, but
// they don't run the invoice three-way-match / posting flow, so we pre-bake their
// stages directly rather than pushing them through runPipeline. Each still opens
// on the Extract stage with a real generated PDF and full field-level extraction.
function mkReferenceDoc(raw, batchId, stageSpec, overallStatus, stoppedAt) {
  const consistency = checkConsistency(raw);
  const extraction = {
    ...raw,
    extractionEngine: 'Demo',
    extractionEngineId: 'demo',
    warnings: raw.warnings || [],
  };
  const stages = {
    ingest:   mkStage(STATUS.PASSED),
    extract:  { ...mkStage(stageSpec.extract, raw.confidence, []), consistency },
    validate: mkStage(stageSpec.validateStatus, null, stageSpec.validateIssues || []),
    route:    mkStage(stageSpec.routeStatus, null, stageSpec.routeIssues || []),
  };
  return {
    id: raw.id,
    batchId,
    vendorName: raw.vendorRaw,
    scenario: raw.scenario || '',
    docType: raw.docType,
    total: raw.total ?? null,
    confidence: raw.confidence ?? null,
    fieldConfidence: raw.fieldConfidence || null,
    sourceUrl: invoicePdfDataUrl(raw, raw.pdf || {}),
    sourceFile: `${raw.id}.pdf`,
    sourceKind: 'generated',
    provenance: null,
    extraction,
    routed: null,
    mapping: null,
    threeWay: null,
    stages,
    currentStage: stoppedAt,
    overallStatus,
    stoppedAt,
    valueAtRisk: 0, // reference docs aren't a payable at risk
    isSynthetic: false,
    traces: [],
  };
}

/** Pre-baked reference documents (purchase order + credit note) for the queue. */
export function referenceDocs(batchId = 'B-2026-0617') {
  const [po, cn] = OTHER_DOCS;
  return [
    mkReferenceDoc(po, batchId, {
      extract: STATUS.PASSED,
      validateStatus: STATUS.PASSED,
      validateIssues: [{ severity: 'info', message: 'Reference document — a purchase order is the order, not a payable; no three-way match' }],
      routeStatus: STATUS.PASSED,
      routeIssues: [{ severity: 'info', message: 'Filed as an open-PO reference for future invoice matching' }],
    }, STATUS.PASSED, 'route'),
    mkReferenceDoc(cn, batchId, {
      extract: STATUS.PASSED,
      validateStatus: STATUS.AUTO,
      validateIssues: [{ severity: 'info', message: 'Credit memo matched to original invoice INV-001 (PO-2024-001)' }],
      routeStatus: STATUS.PASSED,
      routeIssues: [{ severity: 'info', message: 'Credit applied to vendor account' }],
    }, STATUS.AUTO, 'route'),
  ];
}

// One lightweight synthetic invoice with a realistic stop-point distribution.
// `rnd` is the seeded PRNG so the whole fill is reproducible.
function synth(i, batchId, rnd) {
  const stages = { ingest: mkStage(STATUS.PASSED) };
  const conf = round2(0.55 + rnd() * 0.43);
  const r = rnd();

  if (r < 0.015) {
    stages.ingest = mkStage(STATUS.FAILED, null, [{ severity: 'error', message: 'Unreadable / corrupt file at intake' }]);
  } else if (r < 0.055) {
    stages.extract = mkStage(STATUS.REVIEW, conf, [{ severity: 'warn', message: `Low extraction confidence (${Math.round(conf * 100)}%)` }]);
  } else {
    stages.extract = mkStage(conf >= 0.75 && rnd() > 0.5 ? STATUS.PASSED : STATUS.AUTO, conf, []);
    if (r < 0.145) {
      stages.validate = mkStage(STATUS.REVIEW, null, [{ severity: 'warn', message: 'Amount variance / unmapped item — needs review' }]);
    } else if (r < 0.175) {
      stages.validate = mkStage(STATUS.FAILED, null, [{ severity: 'error', message: 'Unknown vendor or PO not found' }]);
    } else {
      stages.validate = mkStage(rnd() < 0.45 ? STATUS.AUTO : STATUS.PASSED, null, []);
      stages.route = mkStage(STATUS.PASSED);
    }
  }
  for (const s of STAGES) if (!stages[s]) stages[s] = mkStage(STATUS.PENDING);

  const { overallStatus, stoppedAt } = deriveOverall(stages);
  const total = round2(80 + rnd() * 7900);
  return {
    id: `INV-${batchId}-${String(i).padStart(4, '0')}`,
    batchId,
    vendorName: pick(SYNTH_VENDORS, rnd),
    scenario: 'Synthetic batch invoice',
    total,
    confidence: conf,
    extraction: null,
    routed: null,
    stages,
    currentStage: stoppedAt,
    overallStatus,
    stoppedAt,
    valueAtRisk: TOUCHLESS.has(overallStatus) ? 0 : total,
    isSynthetic: true,
    traces: [],
  };
}

/**
 * generateSynthetic(count, batchId) → synthetic[] (already in StageResult form).
 * Built once and kept stable across tolerance changes, so the funnel only moves
 * for the real + ingested invoices the tolerance dial actually re-pipes.
 */
export function generateSynthetic(count = 988, batchId = 'B-2026-0617') {
  const rnd = makeRng(0x1a2b3c4d); // fixed seed → identical batch every load
  return Array.from({ length: Math.max(0, count) }, (_, i) => synth(i + 1, batchId, rnd));
}

/**
 * generateBatch(size, tolerance) → { invoices, batch }
 * Real invoices come first (pinned, fully inspectable), then synthetic fill.
 */
export function generateBatch(size = 1000, tolerance = 2) {
  const batchId = 'B-2026-0617';
  const real = [...bundledInvoices(), ...sampleInvoicesWithSource()].map((inv) =>
    runPipeline(inv, tolerance, batchId),
  );
  const synthetic = generateSynthetic(size - real.length, batchId);
  const invoices = [...real, ...synthetic];
  return { invoices, batch: aggregateBatch(invoices, batchId) };
}
