# Invoice Automation — AP intake pipeline

A working prototype of an accounts-payable automation system: documents arrive as
a batch, flow through a four-stage pipeline (**Ingest → Extract → Validate & Map →
Route**), and land as either straight-through (zero-touch) postings or exceptions
routed to a human reviewer. The whole batch is one model, viewable at three zoom
levels, and every transformation is auditable.

The thesis the demo is built to prove: **OCR is commoditised; the normalisation /
mapping / learning layer is the moat.** Reading a document is the cheap, swappable
part. Turning a messy read into a correct, posted, fully-traced ledger entry — and
getting better every time a human corrects it — is the defensible part.

## What it does

- **One staged pipeline, one status grammar.** Every stage emits the same five
  states — `passed` ✅ · `auto_resolved` ↺ · `needs_review` ⚠ · `failed` ✕ ·
  `pending`/`running`. A stage's batch column and its per-invoice stepper node are
  the *same* `StageResult`, summed vs singular.
- **Three zoom levels on the same data.** A batch funnel (counts + % HITL per
  stage), a virtualised worklist that holds 1,000+ rows, and a per-invoice stepper
  that expands each stage into its inspector.
- **A trust surface for extraction.** Side-by-side source PDF + extracted fields,
  per-field confidence, and an arithmetic/consistency gate (Σ line items = subtotal;
  subtotal + tax = total) that catches *confident-but-wrong* extraction the model's
  own confidence score misses.
- **ERP mapping & three-way match (the differentiator).** Line items map to a
  canonical item catalog via exact part# → vendor alias → fuzzy description →
  unmatched, with GL/UoM/tax enrichment, and a PO ↔ goods-receipt ↔ invoice
  three-way match. Mapping is hard *because every vendor names the same cylinder
  differently* — that's the point.
- **Segmentation: 1 file ≠ 1 invoice.** A statement splits into N invoices, each
  stamped with provenance back to its source page, each routing independently.
- **The HITL learning flywheel.** A reviewer's correction is captured to a
  persistent store, fed back into the vendor-alias map, and re-applied across the
  whole batch — so the *next* identical line auto-resolves. Corrections survive a
  reload (localStorage), and a counterfactual "Flywheel Impact" panel measures the
  touches they've removed (learned-aliases ON vs OFF).
- **Eval & guardrails.** Straight-through rate is never read alone: it sits beside
  computed guardrails ($-leakage, exception-escape, false-reject). Extraction
  accuracy is measured against ground truth (raw read vs after-normalisation) with
  a confidence-calibration table, and auto-approval has controls (random-QA
  sampling + new-vendor shadow mode).

## North star & non-negotiables

- **North star:** STP rate (zero-touch %), **guard-railed** by $-leakage and
  false-reject. Never optimise STP alone.
- **Moat:** the intelligence layer (confidence + auto-correction + mapping + the
  HITL→learning flywheel), not the OCR. OCR is pluggable and commodity.
- **Trust is not optional:** field-level confidence, source-vs-extraction
  side-by-side, and an immutable per-field provenance trace. Finance lives or dies
  on auditability.
- **Cheapest strongest gate:** arithmetic/consistency checks — they catch
  confident-but-wrong extraction that confidence scores miss.

## Architecture

```
① INGEST/SEGMENT → ② EXTRACT → ③ VALIDATE & MAP → ④ ROUTE/POST
```

Extraction is two sub-stages: **②a** pixels → text/layout (PLUGGABLE — bring your
own Tesseract/Textract/Azure, or the in-house engine) and **②b** text → fields +
field-confidence + auto-correction (ALWAYS OURS — the moat). Routing decides on the
**minimum confidence of critical fields** (total, PO, vendor, invoice #), never the
document average.

Key directories:

| Path | What lives there |
|---|---|
| `src/pipeline/` | `model.js` (status grammar), `runPipeline.js`, `aggregateBatch.js`, `generateBatch.js`, `segmentation.js`, `mapping.js`, `consistency.js`, `evalMetrics.js` |
| `src/data/` | `inputInvoices.js` (real PDFs + ground truth), `erpCatalog.js`, `goodsReceipts.js`, `vendorMaster.js`, `statements.js`, `correctionsStore.js` (the learning store) |
| `src/utils/extraction/` | `providers.js` — the Layer-1 extraction seam (Demo + Native Claude Vision) |
| `src/components/` | `Worklist`, `BatchFunnel`, `KpiCards`, `ReviewSheet` (+ `ExtractionInspector` / `MappingPanel` / `InvoiceStepper` / `ProvenanceDrawer`), `EvalDashboard` |
| `docs/BUILDERS_MANUAL.md` | the staged, resumable build plan — start at §0 "Where am I" |

## The real document set

Four genuine ESPRIGAS supplier invoices ship in `/input` and run through the
pipeline with human-verified ground truth, each chosen to exercise a different
failure mode:

| Invoice | Quirk it exercises | Outcome |
|---|---|---|
| Vern Lewis Welding | ALL-CAPS vendor → alias-normalised; size bleeds into qty column | auto-corrected |
| Xpedited Gas | dual PO; "Oxygen 20 gas" unmatched → HITL; 3% PO variance | tolerance-sensitive |
| Haun (Scranton) | partial shipment 143/200 → three-way match flags it | needs review |
| Haun (Albany) | spaced/ambiguous PO format → normalised | auto-corrected |

Plus a Sharpgas Q1 statement that segments into 3 invoices, 8 scenario samples
(SaaS subscriptions, non-PO services), 2 reference documents (a purchase order and
a credit note), and ~983 synthetic invoices for 1,000-doc scale.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
```

No API key needed — the bundled **Demo** extraction engine returns verified
extractions for the real invoices. Click **Add documents → Run demo** to drop a
sample into the queue, or drop your own PDF. The **Native** engine (Claude Vision,
`claude-opus-4-8`) reads documents live and needs `VITE_ANTHROPIC_API_KEY`; the
extraction seam is built so the engine is swappable while the normalisation layer
downstream stays constant.

```bash
npm run build      # static production bundle
npm run lint
```

## Tech decisions

- **Vite + React 19, zero runtime deps.** A demo prototype, not a deployed app —
  the pipeline logic and routing taxonomy are the point, not a framework. The
  client-only, in-memory model (with a localStorage learning store) keeps the
  flywheel provable without a backend.
- **Hand-rolled worklist virtualization.** ResizeObserver windowing holds 1,000+
  rows with no list library, preserving the zero-dep ethos.
- **IBM Plex Mono for headings/data, a sans body.** An ops tool: monospace
  reinforces the "machine reading documents" framing for the data, while the body
  reads calmly.

## What's a prototype vs. what's real

This sells the **vision of the intelligence layer**; it is a demo of the *thinking*,
not yet a running production system. Honest gaps (full analysis in
`docs/BUILDERS_MANUAL.md` §9): extraction is baked rather than live for the Demo
engine (no per-token bounding boxes → no click-to-source yet); there's no real ERP
integration (Route/"Approve & Post" is simulated); master data is static fixtures;
and there's no backend/auth/multi-tenancy. Those are the roadmap beyond the phased
build.
