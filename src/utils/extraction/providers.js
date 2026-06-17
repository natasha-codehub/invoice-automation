/**
 * providers.js — the Layer-1 extraction seam.
 *
 * Everything downstream (normalisation → 7 checks → router → eval) consumes one
 * shape, the ExtractionResult contract:
 *
 *   { vendorRaw, invoiceNumber, date, poNumber,
 *     lineItems:[{ desc, qty, unit, total }],
 *     subtotal, tax, total, goodsReceipt, duplicate,
 *     confidence, warnings:[], rawText }
 *
 * So the extractor is swappable: hold Layer 2 constant, change the engine here,
 * and watch the routing distribution (and Phase 5 eval) move. Each result is
 * instrumented via runExtraction() with the engine and wall-clock time.
 */

import { mockExtract } from '../mockExtractor.js';
import { extractFromImage } from '../extractInvoice.js';
import { getBundledExtraction } from '../../data/inputInvoices.js';

// File/Blob → base64 (no data: prefix), for the real vision API call.
function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const PROVIDERS = [
  {
    id: 'demo',
    label: 'Demo · pre-baked',
    short: 'Demo',
    description: 'Zero-config. Returns verified extractions for the bundled invoices; no key, always works.',
    requiresKey: false,
    async extract(file, opts = {}) {
      // Bundled /input file → its pre-baked extraction; else filename heuristic.
      if (opts.sourceName) {
        const baked = getBundledExtraction(opts.sourceName);
        if (baked) return baked;
      }
      return mockExtract(file);
    },
  },
  {
    id: 'native',
    label: 'Native · Claude Vision',
    short: 'Native',
    description: "This project's own OCR — Claude Vision (claude-opus-4-8). Reads the document live; needs VITE_ANTHROPIC_API_KEY.",
    requiresKey: true,
    model: 'claude-opus-4-8',
    async extract(file, opts = {}) {
      let blob = file;
      if (!blob && opts.url) blob = await fetch(opts.url).then(r => r.blob());
      if (!blob) throw new Error('Native engine needs a file or bundled URL to read');
      const b64 = await fileToBase64(blob);
      const result = await extractFromImage(b64, blob.type || 'application/pdf');
      if (!result) throw new Error('Native extraction returned no usable result');
      return result;
    },
  },
];

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

/**
 * runExtraction(engineId, file, opts) — runs the chosen provider and stamps
 * instrumentation onto the result so the UI/eval can attribute it.
 *   opts.sourceName — bundled /input filename (demo lookup)
 *   opts.url        — bundled asset URL (native fetch)
 */
export async function runExtraction(engineId, file, opts = {}) {
  const provider = getProvider(engineId);
  const t0 = performance.now();
  const result = await provider.extract(file, opts);
  return {
    ...result,
    extractionEngine: provider.short,
    extractionEngineId: provider.id,
    extractionModel: provider.model || null,
    extractionMs: Math.round(performance.now() - t0),
  };
}
