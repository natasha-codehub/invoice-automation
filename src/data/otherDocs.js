/**
 * otherDocs.js — non-invoice documents that broaden the demo's variety.
 *
 * AP intake isn't only invoices. These two documents are read & extracted like
 * any other (full field-level extraction + a generated source PDF) but are
 * "reference" documents — they don't run the invoice three-way-match / posting
 * flow. They're pre-baked into the queue by generateBatch.referenceDocs().
 *
 *   - PURCHASE_ORDER — the order itself, extracted and filed as an open-PO
 *     reference (extract-and-display; not wired into matching).
 *   - CREDIT_NOTE — a return/credit memo with negative amounts, matched back to
 *     its original invoice and applied automatically.
 */

export const PURCHASE_ORDER = {
  id: 'PO-2026-100',
  docType: 'purchase_order',
  vendorRaw: 'Matheson Tri-Gas Inc',
  invoiceNumber: 'PO-2026-100', // the document's own number
  poNumber: '',                 // a PO has no separate PO reference — it IS one
  date: '2026-06-10',
  scenario: 'Purchase order — extracted & filed as an open-PO reference (no invoice flow)',
  lineItems: [
    { desc: 'Oxygen cylinder 200cf', qty: 40, unit: 95.0, total: 3800.0 },
    { desc: 'Acetylene cylinder MC', qty: 15, unit: 140.0, total: 2100.0 },
  ],
  subtotal: 5900.0,
  tax: null,
  total: 5900.0,
  confidence: 0.94,
  fieldConfidence: { vendor: 0.95, invoiceNumber: 0.96, date: 0.95, subtotal: 0.94, total: 0.94 },
  pdf: { title: 'PURCHASE ORDER', numberLabel: 'PO Number', totalLabel: 'Order Total' },
};

export const CREDIT_NOTE = {
  id: 'CN-2026-014',
  docType: 'credit_note',
  vendorRaw: 'Acme Supplies Ltd',
  invoiceNumber: 'CN-2026-014',
  poNumber: 'PO-2024-001',
  date: '2026-06-12',
  scenario: 'Credit note — return against INV-001; matched & applied automatically',
  lineItems: [
    { desc: 'Office supplies bundle (returned x2)', qty: -2, unit: 800.0, total: -1600.0 },
  ],
  subtotal: -1600.0,
  tax: -288.0,
  total: -1888.0,
  confidence: 0.93,
  fieldConfidence: { vendor: 0.95, invoiceNumber: 0.94, poNumber: 0.92, date: 0.95, subtotal: 0.93, total: 0.93 },
  pdf: { title: 'CREDIT NOTE', numberLabel: 'Credit Note No.', totalLabel: 'Credit Total' },
};

export const OTHER_DOCS = [PURCHASE_ORDER, CREDIT_NOTE];
