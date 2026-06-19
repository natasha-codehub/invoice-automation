/**
 * erpCatalog.js — the invented ERP item master (Builder's Manual §4).
 *
 * Stage ③ ground truth. Gas-cylinder domain, matched to the real /input invoices.
 * Mapping is hard *because each vendor names the same cylinder differently* — that
 * is the whole point of the demo: OCR reads the text fine, but turning "NIT-58" /
 * "100~NIT060" / "Nitrogen 40 gas" into one canonical MAT-* code is the moat.
 *
 *   MATERIALS            — canonical items (id, name, gas, size, uom, gl, taxClass)
 *   GL_CODES             — GL code → human label
 *   VENDOR_PART_ALIASES  — the learned map: per-vendor part#/desc → MAT-* (seed
 *                          from the real invoices; grows via the HITL flywheel in E)
 */

// ─── Canonical material master ──────────────────────────────────────────────
// taxClass drives the jurisdiction-aware tax check: 'resale' gases are exempt
// for an AP buyer (bought for resale), 'medical' may be taxed, 'service' taxable.
export const MATERIALS = [
  { id: 'MAT-N2-16',  name: 'Nitrogen cylinder 16cf',   gas: 'nitrogen',  size: 16, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-N2-40',  name: 'Nitrogen cylinder 40cf',   gas: 'nitrogen',  size: 40, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-N2-47',  name: 'Nitrogen cylinder 47cf',   gas: 'nitrogen',  size: 47, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-N2-58',  name: 'Nitrogen cylinder 58cf',   gas: 'nitrogen',  size: 58, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-N2-60',  name: 'Nitrogen cylinder 60cf',   gas: 'nitrogen',  size: 60, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-O2-17',  name: 'Oxygen cylinder 17cf',     gas: 'oxygen',    size: 17, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-O2-24',  name: 'Oxygen USP size E 24cf',   gas: 'oxygen',    size: 24, uom: 'CYL', gl: '5011', taxClass: 'medical' },
  { id: 'MAT-O2-40',  name: 'Oxygen industrial 40cf',   gas: 'oxygen',    size: 40, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-ACE-MC', name: 'Acetylene size MC',        gas: 'acetylene', size: 'MC', uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-ACE-B',  name: 'Acetylene size B',         gas: 'acetylene', size: 'B',  uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'MAT-PRO-33', name: 'Propane 33# forklift',     gas: 'propane',   size: 33, uom: 'CYL', gl: '5012', taxClass: 'resale' },
  { id: 'MAT-CO2-20', name: 'CO2 20#',                  gas: 'co2',       size: 20, uom: 'CYL', gl: '5010', taxClass: 'resale' },
  { id: 'FEE-DELIV',  name: 'Delivery charge',          gas: null,        size: null, uom: 'EA', gl: '6300', taxClass: 'service' },
  { id: 'FEE-FUEL',   name: 'Fuel surcharge',           gas: null,        size: null, uom: 'EA', gl: '6310', taxClass: 'service' },
  { id: 'FEE-HAZMAT', name: 'Hazmat handling',          gas: null,        size: null, uom: 'EA', gl: '6800', taxClass: 'service' },
  { id: 'FEE-COMPL',  name: 'Compliance fee',           gas: null,        size: null, uom: 'EA', gl: '6800', taxClass: 'service' },
  { id: 'SVC-VALVE',  name: 'Valve change',             gas: null,        size: null, uom: 'EA', gl: '6400', taxClass: 'service' },
];

export const MAT_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export const GL_CODES = {
  '5010': 'Industrial Gases-COGS',
  '5011': 'Medical Gases',
  '5012': 'Propane',
  '6300': 'Delivery/Freight',
  '6310': 'Fuel Surcharge',
  '6400': 'Cylinder Svc',
  '6800': 'Hazmat/Compliance',
};

// ─── The learned vendor map (seed from the real /input invoices) ─────────────
// Keyed by canonical vendor name (post-alias-normalisation), then by the token
// the document actually carries — a vendor part number OR (for vendors that
// print no part#, like Xpedited) the upper-cased line description. The mapping
// engine looks up the extracted part first, then the full description.
//
// Keys cover both the codes seen on the real PDFs (NIT060, OXY040, OXME…) and
// the §4 alternates (T060, 21106…) so the "learned map" reads as richer history.
export const VENDOR_PART_ALIASES = {
  'Vern Lewis Welding Supply': {
    'NIT-20':  'MAT-N2-16',
    'NIT-58':  'MAT-N2-47',
    'OXY-21':  'MAT-O2-17',
    'ACT-MC10': 'MAT-ACE-MC',
    'ACT-B40': 'MAT-ACE-B',
  },
  'Haun Welding Supply Inc': {
    OXME:   'MAT-O2-24',  '12100': 'MAT-O2-24',
    NIT060: 'MAT-N2-58',  T060: 'MAT-N2-58', '21106': 'MAT-N2-58',
    OXY040: 'MAT-O2-40',  Y040: 'MAT-O2-40', '11104': 'MAT-O2-40',
    ACEMC:  'MAT-ACE-MC',
    PRO033: 'MAT-PRO-33', O033: 'MAT-PRO-33', '71103': 'MAT-PRO-33',
  },
  'Xpedited Gas': {
    'NITROGEN 40 GAS': 'MAT-N2-40',
    'NITROGEN 60 GAS': 'MAT-N2-60',
    'ACETYLENE MC GAS': 'MAT-ACE-MC',
    'FORKLIFT PROPANE': 'MAT-PRO-33',
  },
};
