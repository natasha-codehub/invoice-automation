# Invoice Automation — the narrative

> The story behind the system, for an interview or a demo. Four beats:
> **metric-first**, the **OCR-agnostic moat**, the **learning flywheel**, and
> **auditability**. Each is something you can point at on screen.

---

## The frame

AP automation is sold on one number — straight-through processing (STP) rate, the
share of invoices that post with zero human touch. Every vendor quotes it. The
problem: STP is trivially gameable. Loosen the tolerances, skip the checks, and STP
goes up while wrong invoices get paid. So the product isn't "maximise STP." It's
**"maximise STP without leaking money or rejecting good invoices"** — a guard-railed
metric. That framing drives every decision below.

---

## 1 · Metric-first

**The claim:** I defined what "better" means before building, and the UI refuses to
show STP alone.

- The north star is STP, but it's rendered on the Eval page *beside* its guardrails:
  **$-leakage** (auto-approved-but-wrong), **exception-escape** (bad invoices that
  slipped the gate), and **false-reject** (good invoices wrongly bounced). All three
  are computed from the live batch, not hand-typed — a regression would turn a chip
  amber.
- The cheapest, strongest gate isn't AI — it's **arithmetic**. Σ line items =
  subtotal; subtotal + tax = total; qty × unit = line total. This catches
  *confident-but-wrong* extraction that a confidence score never will. A model can
  be 98% sure of a subtotal that doesn't add up; the consistency gate isn't fooled.
- Routing decides on the **minimum confidence of critical fields** (total, PO,
  vendor, invoice #), never the document average — because one wrong total matters
  more than ten right line descriptions.

**On screen:** the Eval slide-over — STP 81.6% next to $0 leakage / 0% escape / 0%
false-reject; the Extract inspector's consistency gate tripping when you edit a
subtotal.

---

## 2 · The OCR-agnostic moat

**The claim:** reading the document is the commodity; everything after it is the
moat — and I can prove it with data.

- Extraction is split in two: **②a** pixels → text (pluggable — bring your own
  Tesseract/Textract/Azure, or the in-house Claude Vision engine) and **②b** text →
  fields + confidence + auto-correction (always ours). Swap ②a; ②b is constant.
- The eval measures field accuracy on the golden set **as the engine reads it (raw)
  vs after normalisation**: **87.5% → 100%**. The two misses are an ALL-CAPS vendor
  name and a space-formatted PO — exactly the things OCR can't fix but a
  normalisation layer can. The gap *is* the moat, quantified.
- The **confidence-calibration** table shows the engine is least accurate exactly
  where it reports low confidence (50% accuracy in the 0.50–0.69 bin, 100% above) —
  so the confidence score is trustworthy, and the low-confidence fields are
  precisely the ones normalisation repairs.
- Mapping is where the depth lives: every vendor names the same cylinder
  differently ("NIT-58", "Nitrogen 58 CF NI", "T060/21106" → all `MAT-N2-47`).
  Exact part# → vendor alias → fuzzy → unmatched, each writing a trace entry.

**On screen:** the Extraction-accuracy panel (raw → normalised, calibration bins);
the Mapping panel resolving three different vendor strings to one material.

---

## 3 · The learning flywheel

**The claim:** corrections are data, not rework. The system gets better every time a
human touches it.

- When a reviewer resolves an unmatched line, the correction is captured to a
  **persistent** store (localStorage — it survives a reload, which kills the "a
  correction dies on refresh" critique) and fed back into the vendor-alias map.
- The whole batch then **re-maps**: the next identical line auto-resolves with a
  `LEARNED` badge. Resolve once, and every matching line across the batch clears.
- The **Flywheel Impact** panel makes it measurable — it re-pipes the batch with
  learned aliases turned OFF (the pre-flywheel baseline) and diffs: aliases learned,
  lines auto-resolved, exceptions removed, touch-rate baseline → now. It's honest:
  when another check (a price variance) still holds an invoice, it shows the
  touchless rate "unchanged" with a note — the mapping exception is gone even when
  the headline doesn't move.

**On screen:** resolve Xpedited's "Oxygen 20 gas" → `MAT-O2-17`; watch it flip
UNMATCHED → LEARNED (30% → 96%), reload, and see it persist; open Flywheel Impact.

---

## 4 · Auditability

**The claim:** finance can't take "the AI did it." Every value carries its lineage.

- Every stage transition writes an append-only **TraceEntry**: `field`, `from`,
  `to`, `actor` (`engine:native` / `rule:po_norm` / `human:<id>` / `map:fuzzy`),
  rule id, confidence, timestamp, reversible. No silent mutations.
- The **Provenance drawer** shows the full per-field history — segmentation →
  normalisation → mapping → human edit — each with its actor badge, confidence, and
  rule. A human correction is logged with its reason.
- **1 file ≠ 1 invoice:** a statement segments into N invoices, each traceable back
  to its source page. Auto-approval is never blind — a random-QA sample is pulled
  for spot-check, and any vendor with no payment history runs in shadow mode (where
  bank-change fraud and bad master data hide).

**On screen:** the 🧾 Trace drawer on any resolved invoice; the segment provenance
subline ("↳ segment 2/3 of statement … source page 2 of 3"); the auto-approval
controls on the Eval page.

---

## The honest close

This prototype sells the *vision of the intelligence layer* well — but it's a demo
of the thinking, not a running production system. The standing gaps (see
`BUILDERS_MANUAL.md` §9): real extraction with bounding-box click-to-source; one
real ERP integration so "Approve & Post" actually posts; and a backend with
persistence, audit retention, and auth. Naming those gaps honestly is part of the
pitch — it shows you know where the moat actually gets dug.
