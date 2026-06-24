/**
 * statements.js — a multi-transaction supplier document (Builder's Manual §5,
 * Phase D). The whole point: 1 file ≠ 1 invoice.
 *
 * A vendor "statement" bundles several billable transactions onto one PDF. The
 * old mock (mockExtractor.SHARPGAS_EXTRACTION) cheated by extracting only the
 * most-recent transaction and flagging the rest for manual reconciliation —
 * exactly the failure Phase D fixes. Here the statement carries every
 * transaction in full so the ingest/segment stage can split it into N
 * independent PipelineInvoices, each traceable back to its source page.
 *
 * Sharpgas bills propane by the gallon (not by our cylinder catalog), so the
 * three segments deliberately route three different ways once they hit Stage ②/③:
 *   seg 1 (Jan) — a nitrogen cylinder + delivery fee → maps clean → touchless
 *   seg 2 (Feb) — bulk propane by the gallon → no catalog match → Validate review
 *   seg 3 (Mar) — two merged lines, faint print → low OCR confidence → Extract review
 * That spread is the demo: the same splitter feeds three invoices that the
 * pipeline then judges on their own merits.
 */

// Each transaction is a complete extraction (the ExtractionResult contract),
// plus where on the statement it came from (sourcePage / lineRange) for the
// per-segment provenance trace.
export const SHARPGAS_STATEMENT = {
  docId: 'DOC-SHARPGAS-Q1',
  sourceFile: 'Sharpgas-Statement-Q1-2024.pdf',
  kind: 'statement',
  vendorRaw: 'Sharpgas Inc',
  account: 'Industrial-2847',
  period: 'Jan–Mar 2024',
  pageCount: 3,
  rawText: `SHARPGAS INC — CUSTOMER STATEMENT
Account: Industrial-2847        Statement Period: Jan–Mar 2024

PAGE 1  ── Invoice SG-2024-0118 (08/01/2024) ──────────────────────────────
  Nitrogen cylinder 40cf        20   155.0000    3,100.00
  Delivery charge                1   250.0000      250.00
  Sub Total 3,350.00   Tax 18% 603.00   Total (USD) 3,953.00
  PO Reference: PO-SG-0118

PAGE 2  ── Invoice SG-2024-0210 (10/02/2024) ──────────────────────────────
  Bulk propane 145 gal         145    22.5000    3,262.50
  Sub Total 3,262.50   Tax 18% 587.25   Total (USD) 3,849.75
  PO Reference: PO-SG-0210

PAGE 3  ── Invoice SG-2024-0315 (15/03/2024) ──────────────────────────────
  Bulk propane 150 gal         150    22.5000    3,375.00
  Cylinder maintenance fee       1   125.0000      125.00
  Sub Total 3,500.00   Tax 18% 630.00   Total (USD) 4,130.00
  PO Reference: PO-SG-0315   [faint print — low scan quality on this page]`,

  transactions: [
    {
      sourcePage: 1,
      lineRange: 'rows 1–2',
      extraction: {
        vendorRaw: 'Sharpgas Inc',
        invoiceNumber: 'SG-2024-0118',
        date: '08/01/2024',
        poNumber: 'PO-SG-0118',
        scenario: 'Sharpgas statement · segment 1/3 (Jan) — nitrogen cylinder maps clean → touchless',
        lineItems: [
          { desc: 'Nitrogen cylinder 40cf', qty: 20, unit: 155.0, total: 3100.0 },
          { desc: 'Delivery charge',         qty: 1,  unit: 250.0, total: 250.0 },
        ],
        subtotal: 3350.0,
        tax: 603.0,
        total: 3953.0,
        currency: 'USD',
        goodsReceipt: true,
        duplicate: false,
        confidence: 0.86,
        fieldConfidence: { vendor: 0.84, invoiceNumber: 0.88, poNumber: 0.82, date: 0.80, subtotal: 0.90, total: 0.90 },
        warnings: [],
        rawText: `SHARPGAS INC — Invoice SG-2024-0118   Date: 08/01/2024
Customer P.O.: PO-SG-0118
Nitrogen cylinder 40cf   20  155.0000  3,100.00
Delivery charge           1  250.0000    250.00
Sub Total 3,350.00   Tax 18% 603.00   Total (USD) 3,953.00`,
      },
    },
    {
      sourcePage: 2,
      lineRange: 'row 1',
      extraction: {
        vendorRaw: 'Sharpgas Inc',
        invoiceNumber: 'SG-2024-0210',
        date: '10/02/2024',
        poNumber: 'PO-SG-0210',
        scenario: 'Sharpgas statement · segment 2/3 (Feb) — propane billed by the gallon, no catalog match → Validate review',
        lineItems: [
          { desc: 'Bulk propane 145 gal', qty: 145, unit: 22.5, total: 3262.5 },
        ],
        subtotal: 3262.5,
        tax: 587.25,
        total: 3849.75,
        currency: 'USD',
        goodsReceipt: true,
        duplicate: false,
        confidence: 0.80,
        fieldConfidence: { vendor: 0.84, invoiceNumber: 0.86, poNumber: 0.82, date: 0.80, subtotal: 0.88, total: 0.88 },
        warnings: [
          'Propane billed by the gallon — the ERP catalog stocks propane only as the 33# forklift cylinder (MAT-PRO-33); unit of measure differs',
        ],
        rawText: `SHARPGAS INC — Invoice SG-2024-0210   Date: 10/02/2024
Customer P.O.: PO-SG-0210
Bulk propane 145 gal   145  22.5000  3,262.50
Sub Total 3,262.50   Tax 18% 587.25   Total (USD) 3,849.75`,
      },
    },
    {
      sourcePage: 3,
      lineRange: 'rows 1–2',
      extraction: {
        vendorRaw: 'Sharpgas Inc',
        invoiceNumber: 'SG-2024-0315',
        date: '15/03/2024',
        poNumber: 'PO-SG-0315',
        scenario: 'Sharpgas statement · segment 3/3 (Mar) — faint print, low OCR confidence → Extract review',
        lineItems: [
          { desc: 'Bulk propane 150 gal',      qty: 150, unit: 22.5,  total: 3375.0 },
          { desc: 'Cylinder maintenance fee',  qty: 1,   unit: 125.0, total: 125.0 },
        ],
        subtotal: 3500.0,
        tax: 630.0,
        total: 4130.0,
        currency: 'USD',
        goodsReceipt: false,
        duplicate: false,
        confidence: 0.58,
        fieldConfidence: { vendor: 0.70, invoiceNumber: 0.55, poNumber: 0.52, date: 0.60, subtotal: 0.66, total: 0.66 },
        warnings: [
          'Low OCR confidence — third statement page is faint / low scan quality',
          'Two charges merged on one statement row (propane delivery + cylinder maintenance)',
        ],
        rawText: `SHARPGAS INC — Invoice SG-2024-0315   Date: 15/03/2024
Customer P.O.: PO-SG-0315   [faint print]
Bulk propane 150 gal   150  22.5000  3,375.00
Cylinder maintenance fee 1  125.0000   125.00
Sub Total 3,500.00   Tax 18% 630.00   Total (USD) 4,130.00`,
      },
    },
  ],
};

export const STATEMENTS = [SHARPGAS_STATEMENT];
