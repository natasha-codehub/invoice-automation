/**
 * goodsReceipts.js — mock warehouse goods-receipt records for the three-way match
 * (Builder's Manual §6 open decision: kept separate from the item master because
 * a GR is a different system of record — receiving, not the catalog).
 *
 * Keyed by the *normalised* PO number (spaces/underscores → dashes, upper-cased —
 * the same form the validation engine produces). Each record carries the received
 * lines so Stage ③ can reconcile PO ↔ goods receipt ↔ invoice quantities.
 *
 * The Haun (Scranton) record is the headline case: 200 cylinders ordered, only
 * 143 physically received — a partial shipment the three-way match must surface
 * even though the invoice arithmetic is internally consistent.
 */

export const goodsReceipts = {
  // Vern Lewis — fully received against PO 6528906-00.
  '6528906-00': {
    status: 'received',
    receivedAt: '2026-05-16',
    lines: [
      { match: 'NIT-20',   ordered: 1,  received: 1 },
      { match: 'NIT-58',   ordered: 27, received: 27 },
      { match: 'OXY-21',   ordered: 9,  received: 9 },
      { match: 'ACT-MC10', ordered: 16, received: 16 },
      { match: 'ACT-B40',  ordered: 2,  received: 2 },
    ],
  },

  // Xpedited — fully received. (The variance on this PO is a $-amount issue on the
  // PO record, not a receiving shortfall — kept distinct so the demo separates the
  // tolerance dial from the three-way match.)
  '40392712': {
    status: 'received',
    receivedAt: '2026-05-14',
    lines: [
      { match: 'OXYGEN 20',     ordered: 10, received: 10 },
      { match: 'NITROGEN 40',   ordered: 21, received: 21 },
      { match: 'NITROGEN 60',   ordered: 1,  received: 1 },
      { match: 'ACETYLENE MC',  ordered: 13, received: 13 },
      { match: 'FORKLIFT',      ordered: 1,  received: 1 },
    ],
  },

  // Haun (Scranton) — PARTIAL: 200 ordered, 143 received. The remaining 57 are
  // backordered; the invoice bills the 143 shipped, so its math is consistent but
  // the receipt is short of the PO.
  'PO05032790': {
    status: 'partial',
    receivedAt: '2026-05-29',
    lines: [
      { match: 'OXME', ordered: 200, received: 143 },
    ],
  },

  // Haun (Albany) — fully received against the normalised PO.
  'PO-02050543': {
    status: 'received',
    receivedAt: '2026-05-29',
    lines: [
      { match: 'NIT060', ordered: 13, received: 13 },
      { match: 'OXY040', ordered: 2,  received: 2 },
      { match: 'ACEMC',  ordered: 3,  received: 3 },
      { match: 'PRO033', ordered: 2,  received: 2 },
    ],
  },
};

/** GR record for a normalised PO, or null when receiving has no record of it. */
export function getGoodsReceipt(normalizedPO) {
  return goodsReceipts[normalizedPO] || null;
}
