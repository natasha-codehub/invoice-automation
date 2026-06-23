# Invoice Automation — Builder's Manual

> A staged, resumable build plan for turning the prototype into a world-class
> AP-automation MVP. Work top-to-bottom. Each phase is independently shippable
> and independently verifiable. If you put this down for days, read
> **§0 Where am I** first, then resume at the first unchecked box.

---

## 0. Where am I (update this as you go)

| | |
|---|---|
| **Current phase** | **Phase E ✓** (HITL flywheel + provenance drawer, browser-verified) → next candidates are §9 priorities 1/3/4 (real extraction, one real ERP post, a backend) |
| **Last worked** | 2026-06-23 (Phase E flywheel, then a **Flywheel Impact** panel in the Eval slide-over: counterfactual touch-rate baseline→now + exceptions removed + lines auto-resolved — the moat made *measurable*) |
| **Next action** | **Decide the next §9 move with Natasha.** With the flywheel done, the standing priorities are: (1) real extraction + bounding-box click-to-source, (3) one real ERP post, (4) a backend. (2) the flywheel is now ✓. |
| **Dev server** | `npm run dev` → http://localhost:5173 |
| **Verify a change** | run app in browser (system Chrome via playwright-core), screenshot the surface — never "tests pass" |

> **UI redesign (2026-06-22, between Phase D and E)** — reskinned + restructured the
> whole shell to a calmer "document queue" operator UX (Rosetta-inspired, kept the
> indigo/Plex-Mono identity). Tokens live in `index.html` (body is now `--sans`,
> mono reserved for headings/data). **Single page, no tabs.** New/changed components:
> `KpiCards.jsx` (4 calm cards), `BatchFunnel.jsx` (now the collapsible "Pipeline view"
> funnel only), `Worklist.jsx` (calm Document·Type·Status-pill·Conf·Amount table, still
> virtualized), `ReviewSheet.jsx` (full-height slide-over with indigo action bar +
> Reject-with-reason modal, wraps the existing Stepper/Inspector/MappingPanel/DetailPanel).
> `App.jsx`: lifecycle filter tabs + funnel filter; **Add documents** popover = upload
> (primary) + Run demo; the Sharpgas statement is **seeded into the batch by default**
> (Type = Statement) instead of a button; the engine selector / Native / `/input` ingest
> buttons were **removed from the UI** (bundled invoices are just part of the batch now);
> Eval dashboard moved behind a top-bar button as a slide-over. `engine` is hard-fixed to
> `'demo'`. Known follow-ups: optional Type filter (All/Content/Statement); decide whether
> the pluggable-engine seam story needs any UI back.

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
- [x] C1. `src/data/erpCatalog.js` from §4 (+ `MAT_BY_ID`; `taxClass` per material drives C6).
- [x] C2. `src/pipeline/mapping.js` — exact→alias→fuzzy→unmatched; multi-parenthetical part extraction; GL/UoM/tax enrichment; per-line TraceEntry.
- [x] C3. **Three-way match** PO ↔ GoodsReceipt ↔ Invoice. Mock GR in `src/data/goodsReceipts.js` (decision logged §6). Haun-Scranton 200-ordered/143-received surfaces as `partial`.
- [x] C4. Confidence-based routing **at this layer**: unmatched material OR min map-confidence < 0.6 floors Validate at needs_review (status ladder in `runPipeline.js`).
- [x] C5. `src/components/MappingPanel.jsx` — shown at the **Validate** stage: three-way table, per-line `rawDesc → material (matchType chip, conf)`, GL, UoM, enrichment, validation checks.
- [x] C6. Tax check is now **jurisdiction-aware** (`inferJurisdiction` in validationEngine.js): USD gas-for-resale → exempt (no false 18% GST flag); INR → GST 18%. Bundled invoices stamped `currency:'USD'`.

**Done when:** ✓ VERIFIED 2026-06-19 (browser) — Vern Lewis maps 5 lines via ALIAS + 3 fees via FUZZY; Haun-Albany Propane resolves via ALIAS 96% (multi-paren fix); Haun-Scranton shows the PARTIAL SHIPMENT three-way banner (Ordered 200 / Received 143 / Invoiced 143) and routes needs_review; Xpedited "Oxygen 20 gas" is UNMATCHED → HITL with suggested fix MAT-O2-17, while its other 6 lines map. Funnel: Validate & Map 10% HITL, Route 811.

> **Known shallow edges (revisit later):** currency *display* is still ₹ across the worklist/funnel/DetailPanel for the USD invoices (only the tax *check* is jurisdiction-aware) — cosmetic, fold into Phase G polish with a currency helper. Mapping runs on the 12 real + ingested invoices only (synthetic fill keeps its pre-baked stage states). HITL "apply suggested fix" action is Phase E.

### Phase D — Stage ① deep: ingest & segmentation
**Goal:** 1 file ≠ 1 invoice.
- [x] D1. Segmentation step: a statement/multi-invoice doc (Sharpgas-style) splits into N PipelineInvoices with `sourcePage`. `src/data/statements.js` (Sharpgas Q1 statement, 3 transactions) + `src/pipeline/segmentation.js` (`segmentDocument` → N extractions, each stamped with `provenance{parentDocId,sourceFile,sourcePage,segmentIndex/Count,lineRange}`). Toolbar "📄 Statement → 3" action mirrors `/input` ingest.
- [x] D2. Batch intake summary (counts, file types, rejected-at-intake). `aggregateBatch` now emits `intake{filesReceived,invoices,statements,segments,rejectedAtIntake}` (one statement file fans out into N invoices; rejected = ingest-stage failures). Rendered as a strip atop `BatchFunnel`.
- [x] D3. Per-segment provenance back to the source page. `runPipeline` ingest stage is segmentation-aware (segment → `auto_resolved` ↺ + "Split from statement … page X of N" issue + a `rule:segment` TraceEntry); `InvoiceStepper` shows a provenance subline; `runPipeline` copies `provenance` onto the PipelineInvoice.

**Done when:** ✓ VERIFIED 2026-06-22 (browser) — clicking "📄 Statement → 3" splits Sharpgas-Statement-Q1-2024.pdf into 3 invoices in the worklist; intake strip reads "1,001 files received → 1,003 invoices · 1 statement segmented into 3 · 14 rejected at intake". The 3 segments route **independently to different stages** (the proof they're real invoices): seg1 (nitrogen cyl, maps clean) → touchless through Route; seg2 (propane billed by the gallon, no catalog match) → stops at Validate; seg3 (faint print, conf 0.58) → stops at Extract. Each stepper shows "↳ segment N/3 of statement … source page N of 3"; the Ingest node shows the split issue + `rule:segment` trace.

> **Known shallow edges (revisit later):** segmentation is the interactive ingest path (one bundled statement), not auto-applied to the synthetic fill — the intake strip reflects it live once ingested. Sharpgas POs (`PO-SG-0118/0210/0315`) were added to `vendorMaster.openPOs` so seg1 can reconcile and reach STP. Statement currency is INR so the GST-18% check fires (display still ₹, consistent with the Phase G currency debt).

### Phase E — HITL worklist + correction-capture flywheel + provenance drawer ✓ (2026-06-23, browser-verified)
**Goal:** close the loop; corrections become data.
- [x] E1. Reviewer UI: keyboard-first (A approve · R reject · P provenance), source+fields, **suggested fix pre-filled** (resolver defaults to the model's suggestedFix); time-per-exception metric (⏱ in the action bar, logged to decisions).
- [x] E2. **Capture every correction** (original→corrected, actor, reason) to a `corrections` store — `src/data/correctionsStore.js`, **localStorage-backed** (survives reload). Also logs Approve/Reject decisions with reason + seconds-in-review.
- [x] E3. Feed corrections back into the vendor alias map (`getLearnedAliases()` merged over seeded `VENDOR_PART_ALIASES` in `mapping.js`); the whole batch re-maps via a `learnVersion` bump, learned matches wear a **LEARNED** badge, and the MappingPanel lists the learned aliases per vendor (the map visibly growing). Header chip shows `🧠 N learned · M corrections` + a demo reset.
- [x] E4. **Provenance drawer** (`ProvenanceDrawer.jsx`): full per-field lineage (segmentation→normalization→mapping + human edits), each with actor badge / conf / rule / time / reversible. Opened from the action bar (🧾 Trace / P).

**Done when:** correcting a mapping in review adds a vendor-part alias so the *next* identical line auto-resolves; the drawer shows the full trace including the human edit. ✓ **Verified:** resolving Xpedited "Oxygen 20 gas" → MAT-O2-17 flips the line UNMATCHED→LEARNED (30%→96%, mapping 6/7→7/7), persists across reload, and the trace shows the learned-alias entry with the human's reason. (Invoice stays Needs-review for the *separate* 3.03% PO variance — correct.)

> **Implementation notes:** decision logged in §6 — corrections store is **localStorage**, not in-memory, specifically to kill the §9 "a correction dies on reload" critique. `mapping.js` is no longer purely static — it reads the learned store and tags learned matches (`learned`, `learnedReason`, `learnedAt` on the line + trace). The token learned mirrors the matcher's lookup exactly: a vendor part#, else the upper-cased full description. `App.piped` gains `learnVersion` in its deps so a taught alias re-maps every invoice in the batch (resolve once → all matching lines auto-resolve).

### Phase F — Eval & guardrail metrics (the original "Phase 5")
**Goal:** settle "OCR vs normalization" with data; guard STP.
- [~] **F0 (done 2026-06-23). Flywheel Impact panel** — the counterfactual touch-rate (learned-aliases ON vs OFF) in the Eval slide-over. `EvalDashboard.FlywheelImpact` + `App.flywheel` + `mapInvoice(…, {ignoreLearned})`. The first measurable guardrail-adjacent metric; the rest of F builds out from here.
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
- [x] **Invoice Processor tab role** (raised 2026-06-17, resolved 2026-06-17): **chose B — merged & retired.** Tolerance dial, engine selector, drop-zone, `/input` ingest, and Run demo now live in a control toolbar atop the Batch Pipeline tab; ingests flow into the worklist as `PipelineInvoice`s (top-pinned, auto-selected, opened at Extract). Tolerance re-pipes only the real + ingested invoices (synthetic fill stays stable). Eval consumes the unified model (`displayInvoices.filter(routed).map(routed)`). Also borrowed two Rosetta UX patterns (kept current identity): richer worklist rows (source/scenario subline + confidence + NEW marker) and a PDF-viewer chrome with a styled mock-page fallback when there's no source PDF. `InvoiceList.jsx` is now unused.
- [ ] PDF renderer: `pdf.js` (real, heavier) vs `<embed>`/`<iframe>` (simple, browser-native)?
- [x] Mock "goods receipt" data source for three-way match (raised + resolved 2026-06-19): **separate file** `src/data/goodsReceipts.js`, keyed by *normalised* PO. Reason: a goods receipt is a different system of record (receiving) from the item master, and keeping it apart lets `threeWayMatch` reconcile ordered/received/invoiced without coupling to the catalog.
- [ ] Worklist virtualization: hand-rolled windowing vs a tiny lib (keep zero-dep ethos?).
- [x] Where the corrections/alias store lives (raised earlier, resolved 2026-06-23): **localStorage** (`src/data/correctionsStore.js`, key `invoice-automation.learning.v1`). Reason: directly answers the §9 critique that "a correction dies on reload" and keeps the zero-dep, client-only ethos — the flywheel is provable without a backend. Write-through to an in-memory cache so `mapping.js` doesn't hit localStorage per line; a pub/sub `subscribe()` lets App bump `learnVersion` to re-map the batch. A backend store is the Phase-beyond-G upgrade (§9 #4).

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

## 9. Gap to world-class (roadmap beyond G) — discussion captured 2026-06-22

> Honest gap analysis vs the products we actually compete with (Rossum, Vic.ai,
> Stampli, Tipalti, Bill.com, AvidXchange, Ottimate, Coupa, SAP Concur, Basware).
> **Framing:** this prototype sells the *vision of the intelligence layer* well, but
> it's a demo of the *thinking*, not a running system. Gaps cluster in four places:
> (1) real ML at scale, (2) the data/integration plane, (3) the enterprise/trust
> substrate, (4) breadth of the AP lifecycle.

**The gaps**
1. **Extraction is baked, not running.** Demo engine returns pre-authored JSON; confidence is hand-written; the pluggable Layer-1 seam is a concept (Native pulled from UI). No per-token bounding boxes → **no click-field-to-source highlight** (the #1 reviewer trust feature). Hard to *prove* the "OCR commoditized, normalization is the moat" thesis without real extraction output flowing through.
2. **No data plane / ERP integration — and "routing to ERP" is the product's name.** Master data (`vendorMaster.js`, `openPOs`, `erpCatalog.js`, `goodsReceipts.js`) is static fixtures; world-class bidirectionally *syncs* it from NetSuite/SAP/Dynamics/QuickBooks. "Approve & Post to ERP" is a no-op; the Route stage does nothing. No connectors/API/webhooks/e-invoicing networks (PEPPOL, India IRN, KSA ZATCA, LATAM CFDI). This is the hardest, most defensible part and it's absent.
3. **Intelligence layer is shallow where depth is the moat.** Validation = 7 fixed rules + one tolerance dial (vs configurable no-code rules + approval matrices/SLAs/delegation). Duplicate detection is a boolean flag (vs fuzzy near-dup across the corpus + fraud/anomaly: bank-change detection, BEC, dup-payment prevention). Mapping is the best piece but runs against a 16-item invented catalog + one mock GR (vs millions of SKUs, multi-line/multi-PO, UOM conversion, freight/tax allocation, history-learned GL coding). **The learning flywheel doesn't exist yet — corrections aren't persisted (Phase E); a correction dies on reload.** That flywheel is the stated moat.
4. **No enterprise substrate.** Client-only React, one in-memory synthetic batch; no backend/persistence/auth/multi-tenancy. `TraceEntry` is the right idea but in-memory (vs immutable/queryable/retained + SOC2/SOX/RBAC/residency). Scale is simulated (virtualized mock rows, not throughput).
5. **Capture→route only, not the full AP lifecycle.** No payments (ACH/wire/vcard/FX), dynamic discounting, supplier onboarding/KYC/W-9, accruals/cash-flow, 1099s, spend analytics. Legitimate scope choice, but a fraction of what the suites sell.

**What it already gets right (don't lose):** one status grammar across 4 stages × 3 zoom levels; confidence-on-critical-fields routing + arithmetic consistency gate (catches confident-but-wrong); mapping-as-the-moat framing; STP-vs-leakage guardrail thinking; auditable per-field trace; segmentation (1 file ≠ 1 invoice).

**Priority order to close the gap (next-session candidates):**
1. **Make extraction real with spatial grounding** — ≥1 real engine + bounding-box overlay + click-to-field. Without it, trust + eval are theater.
2. ~~**Build the learning flywheel for real (= Phase E)**~~ ✓ **DONE 2026-06-23**, incl. the "show touch-rate dropping" piece: a **Flywheel Impact** panel in the Eval slide-over re-pipes the real+ingested set with learned aliases OFF (counterfactual baseline) and diffs — aliases learned, lines auto-resolved, mapping exceptions removed, touchless rate baseline→now, invoices rescued. Honest: shows "unchanged" when another check (variance) still holds the invoice. Built on `mapInvoice(…, {ignoreLearned})` + `App.flywheel`.
3. **One real ERP integration** (NetSuite or QuickBooks) — turn Route + "Approve & Post" into actual master-data sync + posting. Proves the namesake.
4. **A backend with persistence + audit + auth** — the substrate that makes the above demonstrable beyond a single session (and the upgrade path for the localStorage corrections store).
