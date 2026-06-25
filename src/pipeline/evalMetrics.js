/**
 * evalMetrics.js — Phase F: eval & guardrail metrics (Builder's Manual §5).
 *
 * Pure functions, zero-dep, deterministic — so the Eval page reads the same on
 * every load and the numbers are *computed from the batch*, never hand-typed.
 *
 *   F1  extractionAccuracy / calibration — raw OCR vs after-normalisation field
 *       accuracy on the golden set, + a confidence-calibration table. This is the
 *       thesis made measurable: "OCR is commoditised, normalisation is the moat".
 *   F2  guardrails — STP never read alone: $-leakage, exception-escape, and
 *       false-reject, each derived from the live batch so a rising STP can't hide
 *       a rising risk.
 *   F3  qaSample / shadowVendors — controls on auto-approval: a random-QA pull of
 *       auto-approved invoices, and a new-vendor shadow-mode flag.
 */

import { BUNDLED } from '../data/inputInvoices.js';
import { approvedVendors } from '../data/vendorMaster.js';
import { normalise } from '../utils/validationEngine.js';
import { TOUCHLESS } from './model.js';

// ── helpers ──────────────────────────────────────────────────────────────────
const eq = (a, b) => {
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
};

// Deterministic [0,1) hash of a string (FNV-1a) — for a stable QA sample that
// doesn't wobble on reload (Math.random would re-pull a different set each time).
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const normVendor = (name) => normalise({ vendorName: name || '' }).corrected.vendorName || name || '';

// ── F1 · Extraction accuracy vs ground truth ─────────────────────────────────
// For each golden invoice × critical field: the raw extracted value, the value
// after our normalisation, and the human-verified ground truth. The gap between
// raw-accuracy and normalised-accuracy is exactly the work the moat does.
const FIELD_DEFS = [
  { key: 'vendor',        label: 'Vendor',     normalised: true  },
  { key: 'invoiceNumber', label: 'Invoice #',  normalised: false },
  { key: 'poNumber',      label: 'PO number',  normalised: true  },
  { key: 'total',         label: 'Total',      normalised: false },
];

export function extractionAccuracy() {
  const rows = [];
  for (const b of BUNDLED) {
    const ext = b.extraction;
    const gt = b.groundTruth;
    const norm = normalise({ vendorName: ext.vendorRaw, poNumber: ext.poNumber, date: ext.date }).corrected;
    const raw  = { vendor: ext.vendorRaw,         invoiceNumber: ext.invoiceNumber, poNumber: ext.poNumber,     total: ext.total };
    const fixed = { vendor: norm.vendorName,        invoiceNumber: ext.invoiceNumber, poNumber: norm.poNumber,    total: ext.total };
    const fc = ext.fieldConfidence || {};
    for (const f of FIELD_DEFS) {
      const gtv = gt[f.key];
      if (gtv == null) continue;
      const rawMatch  = eq(raw[f.key], gtv);
      const normMatch = eq(fixed[f.key], gtv);
      rows.push({
        invoice: ext.vendorRaw, invoiceNumber: ext.invoiceNumber,
        field: f.key, fieldLabel: f.label,
        gt: gtv, raw: raw[f.key], norm: fixed[f.key],
        rawMatch, normMatch, fixedByNorm: !rawMatch && normMatch,
        confidence: fc[f.key] ?? null,
      });
    }
  }
  const n = rows.length || 1;
  const rawCorrect = rows.filter(r => r.rawMatch).length;
  const normCorrect = rows.filter(r => r.normMatch).length;
  return {
    rows, total: rows.length,
    rawCorrect, normCorrect,
    rawPct: Math.round((rawCorrect / n) * 1000) / 10,
    normPct: Math.round((normCorrect / n) * 1000) / 10,
    fixedByNorm: rows.filter(r => r.fixedByNorm),
    engine: 'Demo · pre-baked',
  };
}

// Confidence calibration: bin the golden fields by the engine's stated confidence
// and show the empirical raw-accuracy in each bin. A well-calibrated engine is
// less accurate exactly where it says it's less confident — and those low-confidence
// fields are the ones normalisation then repairs.
const CAL_BINS = [
  { label: '0.50 – 0.69', lo: 0.50, hi: 0.70 },
  { label: '0.70 – 0.84', lo: 0.70, hi: 0.85 },
  { label: '0.85 – 1.00', lo: 0.85, hi: 1.01 },
];
export function calibration(rows) {
  return CAL_BINS.map((bin) => {
    const inBin = rows.filter(r => r.confidence != null && r.confidence >= bin.lo && r.confidence < bin.hi);
    const correct = inBin.filter(r => r.rawMatch).length;
    const meanConf = inBin.length ? inBin.reduce((s, r) => s + r.confidence, 0) / inBin.length : null;
    return {
      label: bin.label, count: inBin.length, correct,
      accuracy: inBin.length ? Math.round((correct / inBin.length) * 100) : null,
      meanConf: meanConf != null ? Math.round(meanConf * 100) : null,
    };
  });
}

// ── F2 · Guardrail board ─────────────────────────────────────────────────────
// An issue counts as "blocking" if it's the kind that must stop an invoice; a
// touchless invoice carrying one would be auto-approved-but-wrong = leakage.
const BLOCKING = new Set(['error', 'fatal', 'critical', 'high']);
const hasBlockingIssue = (inv) =>
  Object.values(inv.stages || {}).some(st => (st?.issues || []).some(is => BLOCKING.has(is.severity)));

export function guardrails(invoices = [], decisions = []) {
  const touchless = invoices.filter(i => TOUCHLESS.has(i.overallStatus));
  const rejected = invoices.filter(i => i.overallStatus === 'rejected' || i.overallStatus === 'failed');

  // $-leakage + exception-escape: auto-approved invoices that still carry a
  // blocking issue (should be none — the consistency gate + three-way match run
  // before anything goes touchless; computed, not assumed, so a regression shows).
  const escaped = touchless.filter(hasBlockingIssue);
  const leakageValue = escaped.reduce((s, i) => s + (i.total || 0), 0);

  // false-reject: a rejection with no recorded reason. Auto-rejections (failed)
  // always carry a stage issue; reviewer rejections should carry a logged reason.
  const reasoned = new Set(
    (decisions || []).filter(d => d.decision === 'reject' && d.reason).map(d => d.invoiceId),
  );
  const falseRejects = rejected.filter((i) => {
    if (i.overallStatus === 'failed') return !hasBlockingIssue(i);           // auto-reject w/o a fatal issue
    return !reasoned.has(i.id);                                              // reviewer reject w/o a reason
  });

  return {
    touchlessCount: touchless.length,
    rejectedCount: rejected.length,
    leakage: {
      value: leakageValue, count: escaped.length,
      escapeRate: touchless.length ? Math.round((escaped.length / touchless.length) * 1000) / 10 : 0,
      ok: escaped.length === 0,
    },
    falseReject: {
      count: falseRejects.length,
      rate: rejected.length ? Math.round((falseRejects.length / rejected.length) * 1000) / 10 : 0,
      ok: falseRejects.length === 0,
    },
  };
}

// ── F3 · Auto-approval controls ──────────────────────────────────────────────
// Random-QA: pull a stable ~ratePct% of auto-approved invoices for a human spot
// check, so straight-through never means *unwatched*.
export function qaSample(invoices = [], ratePct = 5) {
  const touchless = invoices.filter(i => TOUCHLESS.has(i.overallStatus));
  const target = touchless.length ? Math.max(1, Math.round(touchless.length * ratePct / 100)) : 0;
  const sample = touchless
    .map(i => ({ i, h: hash01(i.id) }))
    .sort((a, b) => a.h - b.h)
    .slice(0, target)
    .map(({ i }) => ({ id: i.id, vendor: i.vendorName, total: i.total, status: i.overallStatus }));
  return {
    autoApproved: touchless.length, ratePct, sampledCount: sample.length,
    sampleValue: sample.reduce((s, x) => s + (x.total || 0), 0),
    sample: sample.slice(0, 8), // show a handful; count is the headline
  };
}

// New-vendor shadow mode: any invoice whose (normalised) vendor isn't on the
// approved-vendor master is "new" — auto-processed but flagged, because a vendor
// with no payment history is where fraud (bank-change, BEC) and bad master data
// hide. World-class AP runs these in shadow for their first few invoices.
export function shadowVendors(invoices = []) {
  const known = new Set(approvedVendors.map(v => v.toLowerCase()));
  const byVendor = new Map();
  let flagged = 0;
  for (const inv of invoices) {
    const name = normVendor(inv.vendorName);
    if (!name || known.has(name.toLowerCase())) continue;
    flagged += 1;
    const cur = byVendor.get(name) || { vendor: name, count: 0, value: 0, touchless: 0 };
    cur.count += 1;
    cur.value += inv.total || 0;
    if (TOUCHLESS.has(inv.overallStatus)) cur.touchless += 1;
    byVendor.set(name, cur);
  }
  const vendors = [...byVendor.values()].sort((a, b) => b.count - a.count);
  return { flagged, vendorCount: vendors.length, vendors };
}
