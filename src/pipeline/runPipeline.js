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
import { mapInvoice, threeWayMatch } from './mapping.js';
import { STAGES, STATUS, FLOW_ON, mkStage, deriveOverall, TOUCHLESS } from './model.js';

// Status severity ladder, so a stage can be *floored* at a worse status without
// ever upgrading something already worse (e.g. mapping can push passed→review,
// but never rescue a validation FAILED).
const RANK = { passed: 0, auto_resolved: 1, needs_review: 2, failed: 3, running: 0, pending: 0 };
const atLeast = (cur, floor) => (RANK[floor] > RANK[cur] ? floor : cur);

// Stage ① — Ingest/Segment (Phase D). A plain single-invoice file passes
// through. A document that was split from a statement carries provenance back to
// its source page; the split is a system enrichment → auto_resolved ↺ with the
// page it came from, so the funnel shows segmentation happening at intake.
function ingestStage(invoice) {
  const p = invoice.provenance;
  if (p && p.kind === 'statement-segment') {
    return mkStage(STATUS.AUTO, null, [{
      severity: 'info',
      field: 'segmentation',
      message: `Split from statement ${p.sourceFile} — invoice ${p.segmentIndex} of ${p.segmentCount}, source page ${p.sourcePage} of ${p.pageCount} (${p.lineRange})`,
    }]);
  }
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

// Stage ③ — Validate & Map (Phase C). The existing router/checks now run
// alongside ERP line mapping + the three-way match, and the stage routes on the
// minimum critical confidence across all three (Manual §3 confidence rule).
function validateStage(invoice, routed, mapping, threeWay) {
  let status = BUCKET_TO_STATUS[routed.bucket] || STATUS.REVIEW;
  const issues = routed.checks
    .filter(c => !c.passed)
    .map(c => ({ severity: c.fatal ? 'error' : 'warn', field: c.id, message: c.detail }));

  // Mapping-driven routing: an unmapped material can't post, low map-confidence
  // is unsafe to auto-approve → both floor the stage at needs_review.
  for (const l of mapping.lines) {
    if (l.matchType === 'unmatched') {
      issues.unshift({ severity: 'warn', field: 'mapping',
        message: `Unmapped line "${l.rawDesc}" — no catalog match${l.suggestedFix ? `; suggest ${l.suggestedFix}` : ''}` });
      status = atLeast(status, STATUS.REVIEW);
    }
  }
  if (mapping.minConfidence != null && mapping.minConfidence < 0.6) {
    status = atLeast(status, STATUS.REVIEW);
  }

  // Three-way match: a partial shipment is a soft hold; billing past the receipt
  // is a leakage risk and gets an error.
  if (threeWay.status === 'partial') {
    issues.unshift({ severity: 'warn', field: 'three_way', message: threeWay.detail });
    status = atLeast(status, STATUS.REVIEW);
  } else if (threeWay.status === 'over_billed') {
    issues.unshift({ severity: 'error', field: 'three_way', message: threeWay.detail });
    status = atLeast(status, STATUS.REVIEW);
  }

  return mkStage(status, mapping.minConfidence, issues);
}

// Stage ④ — Route/Post. Reached only when validate flowed on → posted.
function routeStage() {
  return mkStage(STATUS.PASSED);
}

export function runPipeline(invoice, tolerance = 2, batchId = 'batch', opts = {}) {
  const stages = { ingest: undefined, extract: undefined, validate: undefined, route: undefined };
  let routed = null;

  let mapping = null;
  let threeWay = null;
  stages.ingest = ingestStage(invoice);
  if (FLOW_ON.has(stages.ingest.status)) {
    stages.extract = extractStage(invoice, opts);
    if (FLOW_ON.has(stages.extract.status)) {
      routed = routeInvoice(invoice, tolerance);
      mapping = mapInvoice(invoice, routed.normalisedVendor);
      threeWay = threeWayMatch(invoice, routed.normalisedPO, mapping);
      stages.validate = validateStage(invoice, routed, mapping, threeWay);
      if (FLOW_ON.has(stages.validate.status)) {
        stages.route = routeStage(routed);
      }
    }
  }
  for (const s of STAGES) if (!stages[s]) stages[s] = mkStage(STATUS.PENDING);

  const { overallStatus, stoppedAt } = deriveOverall(stages);

  const prov = invoice.provenance || null;
  const traces = [
    ...(prov?.kind === 'statement-segment' ? [{
      field: 'segmentation',
      from: prov.sourceFile,
      to: `invoice ${prov.segmentIndex}/${prov.segmentCount} (page ${prov.sourcePage})`,
      actor: 'rule:segment',
      message: `Segmented from statement ${prov.sourceFile} — page ${prov.sourcePage} of ${prov.pageCount}`,
      reversible: false,
    }] : []),
    ...(opts.extraTraces || []),
    ...(routed?.corrections || []).map(c => ({
      field: 'normalisation', actor: 'rule:normalise', message: c, reversible: true,
    })),
    ...(mapping?.lines || []).map(l => ({
      ...l.trace,
      message: l.learned
        ? `Mapped "${l.rawDesc}" → ${l.matchedMaterialId} via learned alias${l.learnedReason ? ` — "${l.learnedReason}"` : ''} (${Math.round(l.confidence * 100)}%)`
        : `Mapped "${l.rawDesc}" → ${l.matchedMaterialId || 'UNMATCHED'} (${l.matchType}, ${Math.round(l.confidence * 100)}%)`,
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
    provenance: prov,
    extraction: invoice.confidence != null ? invoice : null,
    routed,
    mapping,
    threeWay,
    stages,
    currentStage: stoppedAt,
    overallStatus,
    stoppedAt,
    valueAtRisk: TOUCHLESS.has(overallStatus) ? 0 : (total || 0),
    isSynthetic: false,
    traces,
  };
}
