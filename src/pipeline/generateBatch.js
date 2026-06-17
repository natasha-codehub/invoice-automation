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
import { runPipeline } from './runPipeline.js';
import { aggregateBatch } from './aggregateBatch.js';
import { STATUS, STAGES, mkStage, deriveOverall, TOUCHLESS } from './model.js';

const round2 = (x) => Math.round(x * 100) / 100;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SYNTH_VENDORS = [
  'Airgas USA LLC', 'Linde Gas & Equipment', 'Praxair Distribution', 'Norco Inc',
  'nexAir LLC', 'Roberts Oxygen', 'WestAir Gases', 'Matheson Tri-Gas Inc',
  'Vern Lewis Welding Supply', 'Haun Welding Supply Inc', 'Xpedited Gas', 'Sharpgas Inc',
];

// The 4 bundled ESPRIGAS invoices as engine-ready invoice objects.
function bundledInvoices() {
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
    };
  });
}

// One lightweight synthetic invoice with a realistic stop-point distribution.
function synth(i, batchId) {
  const stages = { ingest: mkStage(STATUS.PASSED) };
  const conf = round2(0.55 + Math.random() * 0.43);
  const r = Math.random();

  if (r < 0.015) {
    stages.ingest = mkStage(STATUS.FAILED, null, [{ severity: 'error', message: 'Unreadable / corrupt file at intake' }]);
  } else if (r < 0.055) {
    stages.extract = mkStage(STATUS.REVIEW, conf, [{ severity: 'warn', message: `Low extraction confidence (${Math.round(conf * 100)}%)` }]);
  } else {
    stages.extract = mkStage(conf >= 0.75 && Math.random() > 0.5 ? STATUS.PASSED : STATUS.AUTO, conf, []);
    if (r < 0.145) {
      stages.validate = mkStage(STATUS.REVIEW, null, [{ severity: 'warn', message: 'Amount variance / unmapped item — needs review' }]);
    } else if (r < 0.175) {
      stages.validate = mkStage(STATUS.FAILED, null, [{ severity: 'error', message: 'Unknown vendor or PO not found' }]);
    } else {
      stages.validate = mkStage(Math.random() < 0.45 ? STATUS.AUTO : STATUS.PASSED, null, []);
      stages.route = mkStage(STATUS.PASSED);
    }
  }
  for (const s of STAGES) if (!stages[s]) stages[s] = mkStage(STATUS.PENDING);

  const { overallStatus, stoppedAt } = deriveOverall(stages);
  const total = round2(80 + Math.random() * 7900);
  return {
    id: `INV-${batchId}-${String(i).padStart(4, '0')}`,
    batchId,
    vendorName: pick(SYNTH_VENDORS),
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
 * generateBatch(size, tolerance) → { invoices, batch }
 * Real invoices come first (pinned, fully inspectable), then synthetic fill.
 */
export function generateBatch(size = 1000, tolerance = 2) {
  const batchId = 'B-2026-0617';
  const real = [...bundledInvoices(), ...sampleInvoices].map((inv) =>
    runPipeline(inv, tolerance, batchId),
  );
  const synthCount = Math.max(0, size - real.length);
  const synthetic = Array.from({ length: synthCount }, (_, i) => synth(i + 1, batchId));
  const invoices = [...real, ...synthetic];
  return { invoices, batch: aggregateBatch(invoices, batchId) };
}
