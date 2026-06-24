/**
 * docTypes.js — the document-type taxonomy for the queue.
 *
 * AP teams don't just process one shape of "invoice": PO-backed invoices,
 * non-PO/services invoices, subscriptions, credit notes, utility bills, vendor
 * statements and the purchase orders themselves all flow through intake. The
 * `docType` field tags each document; the Type column and the type filter are
 * projections of this registry.
 */

export const DOC_TYPES = {
  invoice:        { label: 'Invoice',        fg: '#2a3bb5', bg: '#e8eefe' },
  invoice_po:     { label: 'PO Invoice',     fg: '#2a3bb5', bg: '#e8eefe' },
  invoice_nonpo:  { label: 'Non-PO',         fg: '#0e7490', bg: '#cffafe' },
  subscription:   { label: 'Subscription',   fg: '#7c3aed', bg: '#ede9fe' },
  credit_note:    { label: 'Credit Note',    fg: '#be123c', bg: '#ffe4e6' },
  purchase_order: { label: 'Purchase Order', fg: '#047857', bg: '#d1fae5' },
  utility:        { label: 'Utility',        fg: '#b45309', bg: '#fef3c7' },
  statement:      { label: 'Statement',      fg: '#6d28d9', bg: '#efeafd' },
};

const FALLBACK = { label: 'Invoice', fg: '#2a3bb5', bg: '#e8eefe' };

/** Resolve a document's type key, honouring an explicit docType then provenance. */
export function docTypeKey(inv) {
  if (inv?.docType && DOC_TYPES[inv.docType]) return inv.docType;
  if (inv?.provenance?.kind === 'statement-segment') return 'statement';
  return 'invoice';
}

/** Resolve a document's type metadata ({ label, fg, bg }). */
export function docTypeMeta(inv) {
  return DOC_TYPES[docTypeKey(inv)] || FALLBACK;
}
