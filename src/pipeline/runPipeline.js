/**
 * runPipeline.js — run ONE invoice through the 4 stages (Phase A, shallow).
 *
 * Wraps the existing engine: Stage ② derives from extraction confidence/warnings;
 * Stage ③ wraps routeInvoice (the existing 7 checks) as a placeholder "validate &
 * map" until Phase C adds real ERP mapping; Stages ①/④ are trivial for now.
 *
 * Short-circuits: a stage that doesn't flow on (needs_review/failed) stops the
 * invoice there; later stages stay `pending` (not reached). This is what makes
 * the batch funnel shrink realistically.
 */

import { routeInvoice } from '../utils/router.js';
import { STAGES, STATUS, FLOW_ON, mkStage, deriveOverall, TOUCHLESS } from './model.js';

// Stage ① — Ingest/Segment. Trivial pass until Phase D.
function ingestStage() {
  return mkStage(STATUS.PASSED);
}

// Stage ② — Extract. Status from extraction confidence + warnings.
function extractStage(invoice) {
  const conf = invoice.confidence;
  if (conf == null) return mkStage(STATUS.PASSED); // pre-extracted sample
  const issues = (invoice.warnings || []).map(w => ({ severity: 'info', message: w }));
  let status;
  if (conf < 0.6) {
    status = STATUS.REVIEW;
    issues.unshift({ severity: 'warn', message: `Low extraction confidence (${Math.round(conf * 100)}%)` });
  } else if (conf >= 0.75 && issues.length === 0) {
    status = STATUS.PASSED;
  } else {
    status = STATUS.AUTO; // proceeded, but flagged warnings
  }
  return mkStage(status, conf, issues);
}

const BUCKET_TO_STATUS = {
  STRAIGHT_THROUGH: STATUS.PASSED,
  AUTO_CORRECTED:   STATUS.AUTO,
  HUMAN_REVIEW:     STATUS.REVIEW,
  AUTO_REJECTED:    STATUS.FAILED,
};

// Stage ③ — Validate & Map. Wraps the existing router/checks (placeholder).
function validateStage(routed) {
  const status = BUCKET_TO_STATUS[routed.bucket] || STATUS.REVIEW;
  const issues = routed.checks
    .filter(c => !c.passed)
    .map(c => ({ severity: c.fatal ? 'error' : 'warn', field: c.id, message: c.detail }));
  return mkStage(status, null, issues);
}

// Stage ④ — Route/Post. Reached only when validate flowed on → posted.
function routeStage() {
  return mkStage(STATUS.PASSED);
}

export function runPipeline(invoice, tolerance = 2, batchId = 'batch') {
  const stages = { ingest: undefined, extract: undefined, validate: undefined, route: undefined };
  let routed = null;

  stages.ingest = ingestStage(invoice);
  if (FLOW_ON.has(stages.ingest.status)) {
    stages.extract = extractStage(invoice);
    if (FLOW_ON.has(stages.extract.status)) {
      routed = routeInvoice(invoice, tolerance);
      stages.validate = validateStage(routed);
      if (FLOW_ON.has(stages.validate.status)) {
        stages.route = routeStage(routed);
      }
    }
  }
  for (const s of STAGES) if (!stages[s]) stages[s] = mkStage(STATUS.PENDING);

  const { overallStatus, stoppedAt } = deriveOverall(stages);

  // Shallow provenance: corrections become traces (full lineage is Phase E).
  const traces = (routed?.corrections || []).map(c => ({
    field: 'normalisation', from: null, to: null,
    actor: 'rule:normalise', message: c, timestamp: null, reversible: true,
  }));

  const total = invoice.total ?? null;
  return {
    id: invoice.id || invoice.invoiceNumber || 'UNKNOWN',
    batchId,
    vendorName: invoice.vendorName || invoice.vendorRaw || 'Unknown Vendor',
    scenario: invoice.scenario || '',
    total,
    confidence: invoice.confidence ?? null,
    extraction: invoice.confidence != null ? invoice : null,
    routed,
    stages,
    currentStage: stoppedAt,
    overallStatus,
    stoppedAt,
    valueAtRisk: TOUCHLESS.has(overallStatus) ? 0 : (total || 0),
    isSynthetic: false,
    traces,
  };
}
