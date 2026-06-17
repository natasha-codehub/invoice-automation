/**
 * mockExtractor.js
 *
 * In production this calls the Anthropic API at /v1/messages with claude-opus-4-8
 * using a base64 image content block. See extractInvoice.js for the real
 * implementation skeleton.
 *
 * This mock returns pre-baked extraction from two real invoices used in the project:
 *   - Matheson Tri-Gas Inc: industrial gas invoice, multi-line, handwritten annotations,
 *     UN hazmat numbers (UN1066, UN1001, UN1072, UN1040), no standard PO visible.
 *   - Sharpgas Inc: a statement format with multiple transactions. The extractor
 *     picks the most recent transaction and flags it for manual review.
 */

// Pre-baked extraction: Matheson Tri-Gas invoice (07/31/18)
// Source: actual Matheson industrial gas shipping document with handwritten "Bought 2" annotation
const MATHESON_EXTRACTION = {
  vendorRaw: 'Matheson Tri-Gas Inc',
  invoiceNumber: 'MTG-2018-07-4821',
  date: '07/31/18',
  poNumber: null,
  lineItems: [
    { desc: 'Nitrogen Cylinder UN1066 (200 cu ft)', qty: 3,  unit: 28.50,  total: 85.50  },
    { desc: 'Acetylene UN1001 (MC grade)',           qty: 2,  unit: 42.00,  total: 84.00  },
    { desc: 'Oxygen Cylinder UN1072 (220 cu ft)',    qty: 4,  unit: 31.75,  total: 127.00 },
    { desc: 'Hydrogen UN1049 (specialty grade)',     qty: 1,  unit: 67.00,  total: 67.00  },
    { desc: 'Cylinder rental fee (customer-owned)',  qty: 1,  unit: 15.00,  total: 15.00  },
    { desc: 'Hazmat handling surcharge',             qty: 1,  unit: 24.50,  total: 24.50  },
  ],
  subtotal: 403.00,
  tax: 72.54,
  total: 475.54,
  goodsReceipt: false,
  duplicate: false,
  confidence: 0.76,
  warnings: [
    'No PO number visible on document — may require manual PO lookup',
    'Handwritten annotations detected: "Bought 2" near cylinder line items',
    'UN hazmat numbers present: UN1066, UN1001, UN1072, UN1049 — verify hazmat compliance',
    'Date format MM/DD/YY normalised to 2018-07-31',
    'Cylinder rental line: customer-owned asset flag — verify ownership records',
  ],
  rawText: `MATHESON TRI-GAS, INC.
Invoice Date: 07/31/18
Account: 4821-Industrial

DESCRIPTION                          QTY    UNIT     TOTAL
Nitrogen Cylinder UN1066 200cu ft      3   28.50     85.50
  [handwritten: "Bought 2"]
Acetylene MC Grade UN1001              2   42.00     84.00
Oxygen Cylinder UN1072 220cu ft        4   31.75    127.00
Hydrogen Specialty Grade UN1049        1   67.00     67.00
Cylinder Rental (customer-owned)       1   15.00     15.00
Hazmat Handling Surcharge              1   24.50     24.50
                                                  --------
SUBTOTAL                                           403.00
TAX (18%)                                           72.54
TOTAL DUE                                          475.54

Payment Terms: Net 30
PO#: [not visible / field blank]`,
};

// Pre-baked extraction: Sharpgas Inc propane statement
// Note: This is a STATEMENT not a single invoice — it has 3 separate transactions.
// The extractor picks the most recent transaction and flags for manual review.
const SHARPGAS_EXTRACTION = {
  vendorRaw: 'Sharpgas Inc',
  invoiceNumber: 'SG-STMT-2024-03',
  date: '15/03/2024',
  poNumber: 'PO-2024-003',
  lineItems: [
    { desc: 'Propane delivery 150 gal (03/15/2024)',  qty: 150, unit: 22.50, total: 3375.00 },
    { desc: 'Cylinder maintenance fee',               qty: 1,   unit: 125.00, total: 125.00 },
  ],
  subtotal: 3500.00,
  tax: 630.00,
  total: 4130.00,
  goodsReceipt: true,
  duplicate: false,
  confidence: 0.61,
  warnings: [
    'Document is a STATEMENT with 3 transactions — extracted most recent (03/15/2024)',
    'Earlier transactions: 02/10/2024 (₹3,200) and 01/08/2024 (₹3,100) — not included',
    'Statement may require full reconciliation against all 3 transactions',
    'Date format DD/MM/YYYY normalised to 2024-03-15',
  ],
  rawText: `SHARPGAS INC — CUSTOMER STATEMENT
Account: Industrial-2847
Statement Period: Jan–Mar 2024

DATE        INVOICE       DESCRIPTION                    AMOUNT
01/08/2024  SG-2024-01   Propane delivery 140 gal       3,100.00
02/10/2024  SG-2024-02   Propane delivery 145 gal       3,200.00
03/15/2024  SG-2024-03   Propane delivery 150 gal +     3,375.00
                          Cylinder maintenance             125.00
                                                       ---------
MOST RECENT TRANSACTION TOTAL (excl. tax)              3,500.00
GST 18%                                                  630.00
AMOUNT DUE (current transaction)                       4,130.00

PO Reference: PO-2024-003`,
};

function selectPayload(file) {
  if (!file) return MATHESON_EXTRACTION;
  const name = (file.name || '').toLowerCase();
  if (name.includes('sharp') || name.includes('propane')) return SHARPGAS_EXTRACTION;
  if (name.includes('matheson') || name.includes('nitrogen') || name.includes('gas')) return MATHESON_EXTRACTION;
  // Default: alternate between the two for any unknown file
  return Math.random() > 0.5 ? MATHESON_EXTRACTION : SHARPGAS_EXTRACTION;
}

/**
 * mockExtract(file) — simulates Claude Vision API extraction.
 * Returns after ~1.5s delay with pre-baked extraction data.
 * @param {File|null} file — the dropped image file (used for filename heuristic only)
 */
export async function mockExtract(file) {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 1500));
  const payload = selectPayload(file);
  return { ...payload };
}

// Pre-baked Matheson result for demo mode (no file needed)
export const DEMO_MATHESON = { ...MATHESON_EXTRACTION };
export const DEMO_SHARPGAS = { ...SHARPGAS_EXTRACTION };
