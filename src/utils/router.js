import { validateInvoice } from './validationEngine.js';

const BUCKETS = {
  STRAIGHT_THROUGH: {
    label: 'Straight Through',
    color: '#10b981',
    dimColor: '#059669',
  },
  AUTO_CORRECTED: {
    label: 'Auto-Corrected',
    color: '#06b6d4',
    dimColor: '#0891b2',
  },
  HUMAN_REVIEW: {
    label: 'Human Review',
    color: '#f59e0b',
    dimColor: '#d97706',
  },
  AUTO_REJECTED: {
    label: 'Auto-Rejected',
    color: '#ef4444',
    dimColor: '#dc2626',
  },
};

export function routeInvoice(invoice, tolerancePercent = 2) {
  const { checks, corrections, normalisedVendor, normalisedPO, correctedInvoice } =
    validateInvoice(invoice, tolerancePercent);

  const fatalFails = checks.filter(c => !c.passed && c.fatal);
  const softFails  = checks.filter(c => !c.passed && !c.fatal);

  let bucket;
  let reason;

  if (fatalFails.length > 0) {
    bucket = 'AUTO_REJECTED';
    reason = fatalFails.map(c => c.detail).join('; ');
  } else if (softFails.length > 0) {
    bucket = 'HUMAN_REVIEW';
    reason = softFails.map(c => c.detail).join('; ');
  } else if (corrections.length > 0) {
    bucket = 'AUTO_CORRECTED';
    reason = `Auto-corrected ${corrections.length} field${corrections.length > 1 ? 's' : ''}: ${corrections.join('; ')}`;
  } else {
    bucket = 'STRAIGHT_THROUGH';
    reason = 'All checks passed — no corrections required';
  }

  const { label: bucketLabel, color: bucketColor, dimColor: bucketDimColor } = BUCKETS[bucket];

  return {
    invoiceId: invoice.id || invoice.invoiceNumber || 'UNKNOWN',
    bucket,
    bucketLabel,
    bucketColor,
    bucketDimColor,
    reason,
    checks,
    corrections,
    normalisedVendor,
    normalisedPO,
    scenario: invoice.scenario || '',
    invoice: correctedInvoice,
    rawInvoice: invoice,
  };
}

export { BUCKETS };
