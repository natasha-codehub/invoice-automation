/**
 * mapping.js — Stage ③ engine (Builder's Manual §4, steps C2/C3).
 *
 * Turns each free-text invoice line into a canonical ERP material, then runs the
 * three-way match (PO ↔ goods receipt ↔ invoice). This is the differentiator: the
 * OCR already read "100~NIT060 NITROGEN 58 CF" perfectly — the value is collapsing
 * three vendors' three names for the same cylinder onto one MAT-* code, with a
 * confidence and an auditable trace for every step.
 *
 * Mapping order (each step writes a TraceEntry):
 *   exact  → the line literally carries a canonical MAT-* code
 *   alias  → the vendor's learned part#/desc map resolves it       (the moat)
 *   fuzzy  → keyword/gas+size heuristic over the catalog
 *   unmatched → routes to HITL, carries a suggestedFix (closest material)
 */

import { MATERIALS, MAT_BY_ID, VENDOR_PART_ALIASES } from '../data/erpCatalog.js';
import { getGoodsReceipt } from '../data/goodsReceipts.js';

const CONF = { exact: 0.99, alias: 0.96, fuzzyFee: 0.82, fuzzyGas: 0.7, unmatched: 0.3 };

// Pull candidate vendor part numbers out of a description: every parenthetical
// token, with receiving-system prefixes ("100~", "008~") stripped, upper-cased.
// A line can carry more than one — e.g. "PROPANE 33# (LIQUID) FORK-LIFT
// (100~PRO033)" — so we return all and let the alias lookup pick the real code.
function extractParts(desc) {
  const out = [];
  const re = /\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(desc || ''))) {
    out.push(m[1].trim().replace(/^\d{2,3}~/, '').toUpperCase());
  }
  return out;
}

function tokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

// Description with the parenthetical part code removed — what we fuzzy-match on.
function descBody(desc) {
  return (desc || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

const GAS_WORDS = { nitrogen: 'nitrogen', oxygen: 'oxygen', acetylene: 'acetylene', propane: 'propane', co2: 'co2' };

// Keyword/gas+size fuzzy match over the catalog. Fees resolve by keyword; gases
// require a same-size cylinder to be *confident* — an off-size gas (e.g. an O2
// cylinder size we don't stock) deliberately falls through to unmatched so it
// routes to review with the nearest material as a suggested fix.
function fuzzy(desc) {
  const body = descBody(desc).toLowerCase();
  const t = new Set(tokens(body));

  if (t.has('delivery') || t.has('freight')) return { id: 'FEE-DELIV', conf: CONF.fuzzyFee };
  if (t.has('fuel')) return { id: 'FEE-FUEL', conf: CONF.fuzzyFee };
  if (t.has('compliance')) return { id: 'FEE-COMPL', conf: CONF.fuzzyFee };
  if (t.has('valve')) return { id: 'SVC-VALVE', conf: CONF.fuzzyFee };
  if (t.has('hazardous') || t.has('hazmat') || body.includes("mat'l") || body.includes('matl'))
    return { id: 'FEE-HAZMAT', conf: CONF.fuzzyFee };

  const gas = Object.keys(GAS_WORDS).find((g) => t.has(g));
  if (gas) {
    const sizeTok = body.match(/(\d{2,3})\s*cf/) || body.match(/\b(\d{2,3})\b/);
    const size = sizeTok ? Number(sizeTok[1]) : null;
    const family = MATERIALS.filter((m) => m.gas === gas && typeof m.size === 'number');
    if (family.length) {
      if (size != null) {
        const exact = family.find((m) => m.size === size);
        if (exact) return { id: exact.id, conf: CONF.fuzzyGas };
        // No same-size cylinder stocked → unmatched, suggest the closest.
        const closest = family.reduce((a, b) => (Math.abs(b.size - size) < Math.abs(a.size - size) ? b : a));
        return { id: null, conf: CONF.unmatched, suggestedFix: closest.id };
      }
      return { id: null, conf: CONF.unmatched, suggestedFix: family[0].id };
    }
  }
  return { id: null, conf: CONF.unmatched };
}

// Map a single line. vendor = canonical (post-normalisation) vendor name.
function mapLine(line, vendor, idx) {
  const desc = line.desc || '';
  const parts = extractParts(desc);
  const aliases = VENDOR_PART_ALIASES[vendor] || {};
  const aliasPart = parts.find((p) => aliases[p]) || null; // the token that resolves
  const part = aliasPart || parts[0] || null;              // shown as the vendor part#

  let matchType, matchedMaterialId, confidence, suggestedFix = null;

  // 1. exact — a canonical MAT-* code printed on the line
  const matCode = desc.toUpperCase().match(/\bMAT-[A-Z0-9-]+\b/);
  if (matCode && MAT_BY_ID[matCode[0]]) {
    matchType = 'exact'; matchedMaterialId = matCode[0]; confidence = CONF.exact;
  } else if (aliasPart) {
    matchType = 'alias'; matchedMaterialId = aliases[aliasPart]; confidence = CONF.alias;
  } else if (aliases[desc.trim().toUpperCase()]) {
    // 2. alias by full description (vendors that print no part#, e.g. Xpedited)
    matchType = 'alias'; matchedMaterialId = aliases[desc.trim().toUpperCase()]; confidence = CONF.alias;
  } else {
    // 3. fuzzy → possibly unmatched
    const f = fuzzy(desc);
    if (f.id) { matchType = 'fuzzy'; matchedMaterialId = f.id; confidence = f.conf; }
    else { matchType = 'unmatched'; matchedMaterialId = null; confidence = f.conf; suggestedFix = f.suggestedFix || null; }
  }

  const mat = matchedMaterialId ? MAT_BY_ID[matchedMaterialId] : null;
  const trace = {
    field: `line[${idx}]`,
    from: desc,
    to: matchedMaterialId || (suggestedFix ? `? (suggest ${suggestedFix})` : 'UNMATCHED'),
    actor: `map:${matchType}`,
    ruleId: matchType === 'alias' ? `alias:${vendor}` : null,
    confidence,
    reversible: true,
  };

  return {
    rawDesc: desc,
    vendorPartNo: part,
    matchedMaterialId,
    materialName: mat?.name || null,
    glCode: mat?.gl || null,
    uom: mat?.uom || null,
    matchType,
    confidence,
    suggestedFix,
    qty: line.qty ?? null,
    total: line.total ?? null,
    trace,
  };
}

/**
 * mapInvoice(invoice, vendor) → MappingResult (§3 contract, extended).
 * `vendor` is the canonical vendor name (pass routed.normalisedVendor).
 */
export function mapInvoice(invoice, vendor) {
  const lines = (invoice.lineItems || []).map((l, i) => mapLine(l, vendor, i));

  const unmatched = lines.filter((l) => l.matchType === 'unmatched');
  const matched = lines.filter((l) => l.matchedMaterialId);
  const minConfidence = lines.length ? Math.min(...lines.map((l) => l.confidence)) : null;

  // Enrichment: GL spread + a tax class derived from the matched materials.
  const glCodes = [...new Set(matched.map((l) => l.glCode).filter(Boolean))];
  const hasMedical = matched.some((l) => MAT_BY_ID[l.matchedMaterialId]?.taxClass === 'medical');
  const enrichment = {
    glCodes,
    taxClass: hasMedical ? 'medical' : matched.length ? 'resale' : null,
    costCenter: 'CC-OPS-GAS', // mock: all gas spend lands in the ops gas cost centre
  };

  return {
    lines,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    minConfidence,
    enrichment,
  };
}

/**
 * threeWayMatch(invoice, normalizedPO, mapping) → reconciles PO ↔ goods receipt ↔
 * invoice quantities. The Haun (Scranton) 143/200 partial-ship surfaces here.
 *
 * status: matched | partial | over_billed | no_gr
 *   - partial      → received < ordered (delivery lag / backorder) — soft
 *   - over_billed  → invoiced > received (billed more than arrived) — leakage risk
 *   - no_gr        → receiving has no record for this PO (informational)
 */
export function threeWayMatch(invoice, normalizedPO, mapping) {
  const gr = getGoodsReceipt(normalizedPO);
  if (!gr) {
    return { po: normalizedPO || null, status: 'no_gr', label: 'No goods-receipt record',
      detail: 'Receiving has no goods-receipt record for this PO — cannot reconcile quantities.', lines: [] };
  }

  const invLines = invoice.lineItems || [];
  const lines = gr.lines.map((g) => {
    const token = g.match.toUpperCase();
    const inv = invLines.find((l) => (l.desc || '').toUpperCase().includes(token));
    const invoiced = inv?.qty ?? null;
    let issue = null;
    if (g.received < g.ordered) issue = 'short_receipt';
    if (invoiced != null && invoiced > g.received) issue = 'over_billed';
    return { match: g.match, desc: inv?.desc || g.match, ordered: g.ordered, received: g.received, invoiced, issue };
  });

  const overBilled = lines.some((l) => l.issue === 'over_billed');
  const partial = lines.some((l) => l.issue === 'short_receipt');

  let status, label, detail;
  if (overBilled) {
    status = 'over_billed'; label = 'Over-billed vs receipt';
    const l = lines.find((x) => x.issue === 'over_billed');
    detail = `Invoiced ${l.invoiced} of "${l.desc}" but only ${l.received} received — billed quantity exceeds goods receipt.`;
  } else if (partial) {
    status = 'partial'; label = 'Partial shipment';
    const l = lines.find((x) => x.issue === 'short_receipt');
    detail = `Ordered ${l.ordered}, received ${l.received}${l.invoiced != null ? `, invoiced ${l.invoiced}` : ''} — partial shipment; ${l.ordered - l.received} cyl still due.`;
  } else {
    status = 'matched'; label = 'Three-way match clean';
    detail = 'PO, goods receipt, and invoice quantities reconcile.';
  }

  return { po: normalizedPO, status, label, detail, lines };
}
