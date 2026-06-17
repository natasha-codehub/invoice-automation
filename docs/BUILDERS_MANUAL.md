# Invoice Automation — Builder's Manual

> A staged, resumable build plan for turning the prototype into a world-class
> AP-automation MVP. Work top-to-bottom. Each phase is independently shippable
> and independently verifiable. If you put this down for days, read
> **§0 Where am I** first, then resume at the first unchecked box.

---

## 0. Where am I (update this as you go)

| | |
|---|---|
| **Current phase** | Phase B ✓ complete (browser-verified) → next is **Phase C** |
| **Last worked** | 2026-06-17 (Phase B built: extraction inspector + consistency gate) |
| **Next action** | (1) Decide the Invoice Processor tab fork (§6); (2) Phase C · C1 — `src/data/erpCatalog.js` (see §4) |
| **Dev server** | `npm run dev` → http://localhost:5173 |
| **Verify a change** | run app in browser (system Chrome via playwright-core), screenshot the surface — never "tests pass" |

**Resume ritual:** `git log --oneline -10` → read this §0 → open the current phase →
find the first unchecked `[ ]` → re-read that phase's *Done when*.

---

## 1. North star & non-negotiables

- **North star:** STP rate (zero-touch %), **guard-railed** by $-leakage (auto-approved-but-wrong) and false-reject rate. Never optimize STP alone.
- **Moat:** the intelligence layer (confidence + auto-correction + mapping + the HITL→learning flywheel), not the OCR. OCR is pluggable and commodity.
- **Trust features are not optional:** field-level confidence, source-vs-extraction side-by-side, and an immutable per-field provenance trace. Finance lives or dies on auditability.
- **Cheapest strongest gate:** arithmetic/consistency checks (line items Σ = subtotal; subtotal+tax = total; qty×unit = line total). They catch *confident-but-wrong* extraction that confidence scores miss.

---

## 2. Architecture (stable reference — don't drift from this)

### 2.1 The pipeline — 4 stages, one status grammar
```
① INGEST/SEGMENT → ② EXTRACT → ③ VALIDATE & MAP → ④ ROUTE/POST
```
Every stage emits the **same five states**:

| State | Meaning | Action |
|---|---|---|
| `passed` ✅ | clean, high confidence | flow on |
| `auto_resolved` ↺ | system fixed/enriched it | show trace, flow on |
| `needs_review` ⚠️ | low confidence / soft fail → HITL | route to worklist |
| `failed` ✕ | unrecoverable here | retry / re-run / reject |
| `running` ⏳ / `pending` | in flight / not yet reached | — |

### 2.2 Three zoom levels (same model, different aggregation)
1. **Batch funnel** — counts + `% HITL@stage` per stage; segments click through to the worklist.
2. **Worklist** — virtualized, faceted list (filter by stage × status), sorted by $-at-risk / age / confidence.
3. **Invoice stepper** — the 4 stages for one invoice, each expandable into its inspector.

> A stage's *batch column* and its *stepper node* are the **same StageResult**, summed vs singular. Build the model once.

### 2.3 Extraction is two sub-stages (the plugin story)
```
②a pixels → text/layout     ← PLUGGABLE (BYO Tesseract/Textract/Azure, or in-house)
②b text → fields + field-confidence + auto-correction  ← ALWAYS OURS (the moat)
```
In-house engine = we also own ②a. Customer's OCR = they own ②a, ②b still runs.
Plugin registration must include a **calibration pass** on the golden set before going live.

---

## 3. Core data contracts (freeze these early; everything depends on them)

```ts
// One invoice as it moves through the pipeline
PipelineInvoice {
  id; batchId; sourceFile; sourcePage;          // provenance of the doc itself
  extraction: ExtractionResult;                 // from the Layer-1 seam (exists today)
  mapping: MappingResult | null;                // Stage ③ output (new)
  stages: { ingest; extract; validate; route: StageResult };
  currentStage; overallStatus;                  // derived
  traces: TraceEntry[];                         // append-only lineage
}

StageResult {
  status: 'passed'|'auto_resolved'|'needs_review'|'failed'|'running'|'pending';
  confidence: number | null;                    // min of critical-field confidences
  issues: Issue[];                              // {severity, field, message, suggestedFix?}
  enteredAt; completedAt;
}

TraceEntry {                                    // one per field transformation
  field; from; to;
  actor: 'engine:native' | 'rule:po_norm' | 'human:<id>' | 'map:fuzzy' ...;
  ruleId | null; confidence; timestamp; reversible: boolean;
}

MappingResult {
  lines: [{ rawDesc, vendorPartNo, matchedMaterialId, glCode, uom,
            matchType: 'exact'|'alias'|'fuzzy'|'unmatched'|'human', confidence }];
  threeWayMatch: { po; goodsReceipt; invoice; status };
  enrichment: { costCenter?, taxCode? };
}

Batch {
  id; receivedAt; totalCount;
  funnel: { [stage]: { in; passed; auto; review; failed } };
  stp: { count; pct }; leakageEstimate; valueAtRisk;
}
```
**Confidence rule:** route on the **minimum confidence of *critical* fields**
(total, PO, vendor, invoiceNumber), never the document average.

---

## 4. The invented ERP item catalog (Stage ③ ground truth)

Seed file: `src/data/erpCatalog.js`. Gas-cylinder domain, matched to the real
/input invoices. Mapping is hard *because each vendor names the same cylinder
differently* — that's the demo's whole point.

```
MATERIALS (canonical)
  MAT-N2-16   Nitrogen cylinder 16cf    UoM CYL  GL 5010  tax TX-EXEMPT
  MAT-N2-40   Nitrogen cylinder 40cf    UoM CYL  GL 5010
  MAT-N2-47   Nitrogen cylinder 47cf    UoM CYL  GL 5010
  MAT-N2-58   Nitrogen cylinder 58cf    UoM CYL  GL 5010
  MAT-N2-60   Nitrogen cylinder 60cf    UoM CYL  GL 5010
  MAT-O2-17   Oxygen cylinder 17cf      UoM CYL  GL 5010
  MAT-O2-24   Oxygen USP size E 24cf    UoM CYL  GL 5011 (medical)
  MAT-O2-40   Oxygen industrial 40cf    UoM CYL  GL 5010
  MAT-ACE-MC  Acetylene size MC         UoM CYL  GL 5010
  MAT-ACE-B   Acetylene size B          UoM CYL  GL 5010
  MAT-PRO-33  Propane 33# forklift      UoM CYL  GL 5012
  MAT-CO2-20  CO2 20#                   UoM CYL  GL 5010
  FEE-DELIV   Delivery charge           UoM EA   GL 6300
  FEE-FUEL    Fuel surcharge            UoM EA   GL 6310
  FEE-HAZMAT  Hazmat handling           UoM EA   GL 6800
  FEE-COMPL   Compliance fee            UoM EA   GL 6800
  SVC-VALVE   Valve change              UoM EA   GL 6400

GL CODES   5010 Industrial Gases-COGS · 5011 Medical Gases · 5012 Propane
           6300 Delivery/Freight · 6310 Fuel Surcharge · 6400 Cylinder Svc
           6800 Hazmat/Compliance

VENDOR PART ALIASES (the learned map — seed from real invoices)
  Vern Lewis : NIT-20→MAT-N2-16, NIT-58→MAT-N2-47, OXY-21→MAT-O2-17,
               ACT-MC10→MAT-ACE-MC, ACT-B40→MAT-ACE-B
  Haun       : T060/21106→MAT-N2-58, Y040/11104→MAT-O2-40, ACEMC→MAT-ACE-MC,
               O033/71103→MAT-PRO-33, OXME/12100→MAT-O2-24
  Xpedited   : "Nitrogen 40 gas"→MAT-N2-40, "Nitrogen 60 gas"→MAT-N2-60,
               "Acetylene MC gas"→MAT-ACE-MC, "Forklift propane"→MAT-PRO-33
```
**Mapping engine order:** exact part# → vendor alias → fuzzy desc (token/levenshtein)
→ unmatched (→ HITL). Each step writes a TraceEntry with matchType + confidence.
UoM mismatch (CYL vs EA) is a soft issue. Unmatched material or GL = needs_review.

---

## 5. Phases

> Order: **shallow skeleton (A)** → deep **Stage ② extraction inspector (B)** →
> deep **Stage ③ mapping (C)** → deep **Stage ① segmentation (D)** →
> **HITL flywheel + provenance (E)** → **eval & guardrail metrics (F)** → **polish (G)**.
> Each phase ends with a browser-verified *Done when* and a commit.

### Phase A — Pipeline skeleton (all 4 stages shallow, 3 zoom levels)
**Goal:** the whole pipeline is *visible* end-to-end on mock data; no deep logic yet.
**Why first:** locks the data model (§3) and the IA before any stage gets expensive.

Build steps:
- [x] A1. `src/pipeline/model.js` — status grammar, `mkStage`, `deriveOverall()`, `STATUS_META`.
- [x] A2. `src/pipeline/runPipeline.js` — one invoice through 4 stages, short-circuiting; wraps `routeInvoice` for validate. (`runExtraction` stays the live-ingest path; batch uses baked confidence.)
- [x] A3. `src/pipeline/aggregateBatch.js` — funnel counts + `% HITL@stage` + STP + value-at-risk.
- [x] A3b. `src/pipeline/generateBatch.js` — 12 real invoices (full depth) + synthetic fill to 1,000 (scale).
- [x] A4. **BatchFunnel** (Zoom 1) — segmented bars, flow-on connectors, clickable segments.
- [x] A5. **Worklist** (Zoom 2) — hand-rolled virtualization (ResizeObserver), facet filter, sort by $-at-risk/conf/vendor.
- [x] A6. **InvoiceStepper** (Zoom 3) — 4 nodes + active-stage issues, reuses `DetailPanel` below.
- [x] A7. Wired into `App.jsx` as the **Batch Pipeline** tab.

**Done when (verify in browser):** ✓ VERIFIED 2026-06-17 — funnel shows 1,000 in →
982 → 940 → 818 with HITL 0/4.3/8.4/0% per stage, 81.8% STP; clicking the
Validate⚠ segment filters the worklist to 79; selecting INV-005 opens the stepper
(Ingest✓ Extract✓ Validate⚠ Route·notreached) with the goods-receipt issue and the
full inspector below. Virtualization holds at 1,000 rows.

> **Known shallow edges (intentional, revisit in later phases):** batch generated
> once at tolerance 2% (doesn't react to the dial yet); synthetic invoices have no
> deep inspector; STP headline counts passed+auto (touchless) — split out
> straight-through vs auto-corrected when the guardrail metrics land (Phase F).

### Phase B — Stage ② deep: extraction inspector
**Goal:** the trust surface for extraction.
- [x] B1. **Side-by-side**: source PDF (`<iframe>` of the bundled URL) next to extracted fields. `src/components/ExtractionInspector.jsx`.
- [x] B2. **Field-level confidence** per field (`fieldConfidence` on the 4 baked extractions; low fields flagged red). Human edits set that field's confidence to 100%.
- [x] B3. **Arithmetic/consistency gate** (`src/pipeline/consistency.js`): Σ line totals = subtotal; subtotal+tax = total; qty×unit = line total. A hard mismatch routes Extract → needs_review regardless of model confidence.
- [x] B4. **Actions:** Edit field (controlled draft, commits on blur, re-pipes + `human:` trace) · Accept (forces extract auto_resolved + trace) · Re-extract (re-runs the engine, `engine:` trace). All via a `patched` override map in App that re-runs `runPipeline`; the funnel updates live.
- [x] B5. Empty/failure states: no-source placeholder for sample/synthetic; native-no-key surfaces the error banner.

**Done when:** ✓ VERIFIED 2026-06-17 — selecting bundled INV-XPEDITED opens the
inspector defaulted to Extract: PDF iframe (left) + editable fields with confidence
% (right) + consistency gate "all checks pass". Editing subtotal → 999 trips the
gate ("Σ 468.80 ≠ subtotal 999.00"), flips Extract → needs_review, and surfaces an
Accept action. Tabs reordered: **Batch Pipeline first, Invoice Processor second.**

> **Known shallow edges (revisit later):** re-extract on the Demo engine returns
> the same baked data (deterministic) — version *history* is trace-only, no diff UI
> (defer to Phase E). Native re-extract needs a key. PDF rendered via `<iframe>`
> (browser viewer), not `pdf.js` — fine for demo, no bounding-box highlights yet.

### Phase C — Stage ③ deep: ERP mapping & validation
**Goal:** the differentiator — line items mapped to ERP, three-way match, confidence routing.
- [ ] C1. `src/data/erpCatalog.js` from §4.
- [ ] C2. `src/pipeline/mapping.js` — exact→alias→fuzzy→unmatched; UoM check; GL/tax enrichment; per-line TraceEntry.
- [ ] C3. **Three-way match** PO ↔ GoodsReceipt(mock) ↔ Invoice (the Haun 143/200 partial-ship case must surface here).
- [ ] C4. Confidence-based routing **at this layer** (low map-confidence or unmatched material → HITL).
- [ ] C5. Mapping panel in the inspector: each line `rawDesc → matchedMaterial (matchType, conf)`, GL, UoM, enrichment, with traces.
- [ ] C6. Replace the India-specific 18% GST check with a **jurisdiction-aware** tax check (kills the false-flag on the USD invoices).

**Done when:** the 4 real invoices map their cylinder lines to MAT-* via the right matchType (exact/alias/fuzzy); Haun-Scranton flags partial-ship in three-way match; one invented unmatched line routes to HITL with a suggested fix.

### Phase D — Stage ① deep: ingest & segmentation
**Goal:** 1 file ≠ 1 invoice.
- [ ] D1. Segmentation step: a statement/multi-invoice doc (Sharpgas-style) splits into N PipelineInvoices with `sourcePage`.
- [ ] D2. Batch intake summary (counts, file types, rejected-at-intake).
- [ ] D3. Per-segment provenance back to the source page.

**Done when:** a multi-transaction statement enters as 1 file and appears as N invoices in the funnel/worklist, each traceable to its page.

### Phase E — HITL worklist + correction-capture flywheel + provenance drawer
**Goal:** close the loop; corrections become data.
- [ ] E1. Reviewer UI: keyboard-first, source+fields, **suggested fix pre-filled**; time-per-exception metric.
- [ ] E2. **Capture every correction** (original→corrected, actor, reason) to a `corrections` store.
- [ ] E3. Feed corrections back into vendor alias map + ERP alias map (show the map growing).
- [ ] E4. **Provenance drawer**: full per-field lineage (raw→normalized→enriched→mapped, each actor/conf/rule/time, reversible).

**Done when:** correcting a mapping in review adds a vendor-part alias so the *next* identical line auto-resolves; the drawer shows the full trace including the human edit.

### Phase F — Eval & guardrail metrics (the original "Phase 5")
**Goal:** settle "OCR vs normalization" with data; guard STP.
- [ ] F1. Extraction-accuracy eval per engine vs `groundTruth` (field accuracy, confidence calibration).
- [ ] F2. Guardrail board: STP ↑ vs $-leakage / exception-escape / false-reject.
- [ ] F3. Random-QA sampling of auto-approved; new-vendor shadow mode flag.

**Done when:** the eval tab shows per-engine field accuracy and a calibration curve; the guardrail panel shows STP alongside estimated leakage.

### Phase G — Polish, docs, narrative
- [ ] G1. Empty/error/loading across all stages; perf check at 1000+ (virtualization holds).
- [ ] G2. Update `README.md` + Obsidian `Invoice Automation.md` with the staged-pipeline story.
- [ ] G3. Interview narrative: metric-first, OCR-agnostic moat, the flywheel, auditability.

---

## 6. Open decisions log (append as they come up)
- [ ] **Invoice Processor tab role** (raised 2026-06-17): now overlaps Batch Pipeline (same DetailPanel, smaller list). Unique value to preserve = tolerance dial (live re-route), live drop-to-extract, engine selector. Options — **A** repurpose as a Single-Invoice / Live lane reusing the new stepper (recommended); **B** merge those controls into Batch Pipeline (dial re-runs the whole funnel) & retire the tab; **C** relabel only. Decide before/with Phase C.
- [ ] PDF renderer: `pdf.js` (real, heavier) vs `<embed>`/`<iframe>` (simple, browser-native)?
- [ ] Mock "goods receipt" data source for three-way match — inline in catalog or separate file?
- [ ] Worklist virtualization: hand-rolled windowing vs a tiny lib (keep zero-dep ethos?).
- [ ] Where the corrections/alias store lives (in-memory vs localStorage for demo persistence).

## 7. Glossary
- **STP** straight-through processing (zero human touch).
- **HITL** human-in-the-loop review.
- **Three-way match** PO ↔ goods receipt ↔ invoice reconciliation.
- **Leakage** value of invoices auto-approved but actually wrong.
- **Exception escape rate** bad invoices that slip past the gate.
- **②a / ②b** OCR (pixels→text, pluggable) vs structuring (text→fields+confidence, ours).

## 8. Conventions
- No new runtime deps unless logged in §6 and justified (zero-dep ethos).
- Every stage transition writes a TraceEntry. No silent mutations.
- Verify by **running the app in a browser**, screenshot the surface. Build/lint are necessary, not sufficient.
- Commit per phase with a verifiable *Done when*. Branch off `master`.
