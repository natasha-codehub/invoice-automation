/**
 * model.js — the pipeline spine (Builder's Manual §2–3).
 *
 * Four stages, one five-state status grammar. A stage's batch column and its
 * stepper node are the SAME StageResult — summed vs singular. Everything in the
 * UI is a projection of this model, so freeze it here.
 */

export const STAGES = ['ingest', 'extract', 'validate', 'route'];

export const STAGE_LABELS = {
  ingest:   'Ingest',
  extract:  'Extract',
  validate: 'Validate & Map',
  route:    'Route',
};

export const STATUS = {
  PASSED:  'passed',
  AUTO:    'auto_resolved',
  REVIEW:  'needs_review',
  FAILED:  'failed',
  RUNNING: 'running',
  PENDING: 'pending',
};

export const STATUS_META = {
  passed:        { label: 'Passed',        icon: '✓', color: '#10b981', bg: '#dcfce7' },
  auto_resolved: { label: 'Auto-resolved', icon: '↺', color: '#06b6d4', bg: '#cffafe' },
  needs_review:  { label: 'Needs review',  icon: '⚠', color: '#f59e0b', bg: '#fef9c3' },
  failed:        { label: 'Failed',        icon: '✕', color: '#ef4444', bg: '#fee2e2' },
  running:       { label: 'Running',       icon: '⏳', color: '#6366f1', bg: '#e0e7ff' },
  pending:       { label: 'Not reached',   icon: '·', color: '#94a3b8', bg: '#f1f5f9' },
};

// Statuses that let an invoice flow to the next stage.
export const FLOW_ON = new Set([STATUS.PASSED, STATUS.AUTO]);

export function mkStage(status, confidence = null, issues = []) {
  return { status, confidence, issues };
}

/**
 * Derive the overall outcome + the stage an invoice stopped at.
 * Walks stages in order; the first stage that doesn't flow on is the stop point.
 * All-flow → auto_resolved if anything was auto-fixed, else passed (STP).
 */
export function deriveOverall(stages) {
  let sawAuto = false;
  for (const s of STAGES) {
    const st = stages[s]?.status || STATUS.PENDING;
    if (st === STATUS.AUTO) sawAuto = true;
    if (!FLOW_ON.has(st)) return { overallStatus: st, stoppedAt: s };
  }
  return { overallStatus: sawAuto ? STATUS.AUTO : STATUS.PASSED, stoppedAt: 'route' };
}

// Zero human touch = made it through without a needs_review/failed stop.
export const TOUCHLESS = new Set([STATUS.PASSED, STATUS.AUTO]);
