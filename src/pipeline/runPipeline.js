/**
 * runPipeline.js — run ONE invoice through the 4 stages.
 *
 * Wraps the existing engine: Stage ② derives from extraction confidence + the
 * arithmetic/consistency gate (Phase B); Stage ③ wraps routeInvoice (the existing
 * 7 checks) as a placeholder "validate & map" until Phase C adds ERP mapping;
 * Stages ①/④ are trivial for now.
 *
 * Short-circuits: a stage that doesn't flow on (needs_review/failed) stops the
 * invoice there; later stages stay `pending`. This makes the funnel shrink.
 */

import { routeInvoice } from '../utils/router.js';
import { checkConsistency } from './consistency.js';
import { STAGES, STATUS, FLOW_ON, mkStage, deriveOverall, TOUCHLESS } from './model.js';

// Stage ① — Ingest/Segment. Trivial pass until Phase D.
function ingestStage() {
  return mkStage(STATUS.PASSED);
}

// Stage ② — Extract. Confidence + the arithmetic/consistency gate (B3).
function extractStage(invoice, opts = {}) {
  const conf = invoice.confidence;
  const consistency = checkConsistency(invoice);
  const issues = (invoice.warnings || []).map(w => ({ severity: 'info', message: w }));
  for (const c of consistency.checks) {
    if (!c.passed) issues.unshift({ severity: c.severity, message: c.detail });
  }

  let status;
  if (opts.acceptExtract) {
    issues.unshift({ severity: 'info', message: 'Extraction reviewed & accepted by human' });
    status = STATUS.AUTO;
  } else if (!consistency.ok) {
    issues.unshift({ severity: 'error', message: 'Consistency gate failed — confident-but-wrong risk; routed to review' });
    status = STATUS.REVIEW;
  } else if (conf == null) {
    status = STATUS.PASSED; // pre-extracted sample
  } else if (conf < 0.6) {
    issues.unshift({ severity: 'warn', message: `Low extraction confidence (${Math.round(conf * 100)}%)` });
    status = STATUS.REVIEW;
  } else if (conf >= 0.75 && issues.length === 0) {
    status = STATUS.PASSED;
  } else {
    status = STATUS.AUTO; // proceeded, but flagged warnings
  }
  return { ...mkStage(status, conf, issues), consistency };
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

export function runPipeline(invoice, tolerance = 2, batchId = 'batch', opts = {}) {
  const stages = { ingest: undefined, extract: undefined, validate: undefined, route: undefined };
  let routed = null;

  stages.ingest = ingestStage(invoice);
  if (FLOW_ON.has(stages.ingest.status)) {
    stages.extract = extractStage(invoice, opts);
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

  const traces = [
    ...(opts.extraTraces || []),
    ...(routed?.corrections || []).map(c => ({
      field: 'normalisation', actor: 'rule:normalise', message: c, reversible: true,
    })),
  ];

  const total = invoice.total ?? null;
  return {
    id: invoice.id || invoice.invoiceNumber || 'UNKNOWN',
    batchId,
    vendorName: invoice.vendorName || invoice.vendorRaw || 'Unknown Vendor',
    scenario: invoice.scenario || '',
    total,
    confidence: invoice.confidence ?? null,
    fieldConfidence: invoice.fieldConfidence || null,
    sourceUrl: invoice.sourceUrl || null,
    sourceFile: invoice.sourceFile || null,
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
