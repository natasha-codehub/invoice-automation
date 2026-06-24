/**
 * aggregateBatch.js — fold N PipelineInvoices into the batch funnel (Zoom 1).
 *
 * Per stage: how many reached it, and the breakdown by status — which is exactly
 * "what part didn't go through" and "% needing human review at each stage".
 */

import { STAGES, STATUS, TOUCHLESS } from './model.js';

const COUNTED = [STATUS.PASSED, STATUS.AUTO, STATUS.REVIEW, STATUS.FAILED];

export function aggregateBatch(invoices, batchId = 'batch') {
  const funnel = {};
  for (const stage of STAGES) {
    const tally = { in: 0, passed: 0, auto_resolved: 0, needs_review: 0, failed: 0, flowOn: 0 };
    for (const inv of invoices) {
      const st = inv.stages[stage]?.status;
      if (!COUNTED.includes(st)) continue; // not reached
      tally.in += 1;
      tally[st] += 1;
      if (st === STATUS.PASSED || st === STATUS.AUTO) tally.flowOn += 1;
    }
    tally.reviewPct = tally.in ? (tally.needs_review / tally.in) * 100 : 0;
    tally.failPct = tally.in ? (tally.failed / tally.in) * 100 : 0;
    funnel[stage] = tally;
  }

  const total = invoices.length;
  let touchless = 0, review = 0, failed = 0, posted = 0, rejected = 0, valueAtRisk = 0, valueTotal = 0;
  // Intake/segmentation accounting (Stage ①): files received vs invoices produced.
  let segments = 0, rejectedAtIntake = 0;
  const parentDocs = new Set();
  for (const inv of invoices) {
    if (TOUCHLESS.has(inv.overallStatus)) touchless += 1;
    else if (inv.overallStatus === STATUS.FAILED) failed += 1;
    else if (inv.overallStatus === STATUS.POSTED) posted += 1;     // human-approved → resolved, not touchless STP
    else if (inv.overallStatus === STATUS.REJECTED) rejected += 1; // human-rejected → resolved
    else review += 1;
    valueAtRisk += inv.valueAtRisk || 0;
    valueTotal += inv.total || 0;

    if (inv.provenance?.kind === 'statement-segment') {
      segments += 1;
      parentDocs.add(inv.provenance.parentDocId);
    }
    if (inv.stages.ingest?.status === STATUS.FAILED) rejectedAtIntake += 1;
  }

  // One statement file fans out into N invoices, so the file count is the
  // single-invoice docs plus one file per distinct statement.
  const statements = parentDocs.size;
  const singles = total - segments;
  const filesReceived = singles + statements;

  return {
    id: batchId,
    totalCount: total,
    funnel,
    stp: { count: touchless, pct: total ? (touchless / total) * 100 : 0 },
    needsReview: review,
    failed,
    posted,
    rejected,
    valueAtRisk,
    valueTotal,
    intake: {
      filesReceived,
      invoices: total,
      statements,
      segments,
      rejectedAtIntake,
    },
  };
}
