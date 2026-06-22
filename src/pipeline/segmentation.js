/**
 * segmentation.js — Stage ① deep (Builder's Manual §5, Phase D · D1/D3).
 *
 * 1 file ≠ 1 invoice. A vendor statement carries several billable transactions
 * on one document; this splits it into N independent extraction objects, each
 * stamped with provenance back to its source page. Downstream, runPipeline's
 * ingest stage reads that provenance to emit an `auto_resolved` ↺ + a
 * `rule:segment` trace, and every segment then runs the full ②/③/④ pipeline on
 * its own merits.
 *
 * A plain single-invoice document passes straight through as one segment with
 * `provenance: null`, so the ingest path is uniform whether or not a split happened.
 */

/**
 * segmentDocument(doc) → ExtractionResult[]
 * `doc` is either a single extraction (returned as-is, no provenance) or a
 * statement (`kind: 'statement'` with a `transactions[]` array → split).
 */
export function segmentDocument(doc) {
  if (!doc || doc.kind !== 'statement' || !Array.isArray(doc.transactions)) {
    return [{ ...doc, provenance: null }];
  }

  const count = doc.transactions.length;
  return doc.transactions.map((tx, i) => ({
    ...tx.extraction,
    provenance: {
      kind: 'statement-segment',
      parentDocId: doc.docId,
      sourceFile: doc.sourceFile,
      sourcePage: tx.sourcePage,
      pageCount: doc.pageCount,
      lineRange: tx.lineRange,
      segmentIndex: i + 1,
      segmentCount: count,
    },
  }));
}

/** True when a document will split into more than one invoice. */
export function isMultiInvoice(doc) {
  return !!doc && doc.kind === 'statement' && Array.isArray(doc.transactions) && doc.transactions.length > 1;
}
