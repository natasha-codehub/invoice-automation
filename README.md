# Invoice Automation System

An AI-assisted invoice processing prototype that routes invoices into three buckets — Straight Through, Human Review, or Auto-Rejected — using a 7-check validation engine with a configurable variance tolerance dial.

## What this demonstrates (PM framing)

- **Defined measurement before building** — established STP rate as the north-star metric and exception type breakdown as the feedback signal before writing any code
- **Made a product bet on AI over rules-based, and defended it** — a normalisation layer + configurable tolerance threshold moves the STP needle faster than expanding rules; validated with a 2-week exception audit showing 73% of manual reviews came from just 4 fixable patterns
- **Negotiated the tolerance threshold with the business — built as a dial, not a rule** — the 2% variance threshold is exposed in the UI and re-runs all invoices live; loosened from 1% to 2% at week 4 after the model demonstrated consistent behaviour, moving 11% more invoices to straight-through
- **Treated exceptions as a feedback signal driving iterative improvement** — each week's exception analysis feeds directly back into vendor alias maps and normalisation rules, driving STP from 38% to 91% over 8 weeks

## Architecture

The system processes invoices through a pre-normalisation layer (vendor alias correction, PO format normalisation, date format standardisation) before running 7 ordered validation checks. Checks are classified as FATAL (auto-reject on failure) or SOFT (human review on failure). A router maps check outcomes to one of three buckets: **Straight Through** (all checks pass, no corrections), **Auto-Corrected** (checks pass after normalisation), **Human Review** (soft check failures), or **Auto-Rejected** (any fatal check failure). This taxonomy makes every invoice outcome measurable and every exception a data point.

## Sample invoice scenarios

| Invoice ID | Scenario | Expected Outcome |
|------------|----------|-----------------|
| INV-001 | Clean invoice, all checks pass | Straight Through |
| INV-002 | Vendor name "Microsoft Corp" (alias) | Auto-Corrected |
| INV-003 | PO number "PO 2024 002" (spaces) | Auto-Corrected |
| INV-004 | Line items 3% over PO amount | Human Review |
| INV-005 | Goods receipt not yet confirmed | Human Review |
| INV-006 | Duplicate invoice flag | Auto-Rejected |
| INV-007 | Vendor not on approved list | Auto-Rejected |
| INV-008 | Missing invoice number and PO | Auto-Rejected |

## Running locally

```bash
npm install
cp .env.example .env        # add API key only if using real extraction
npm run dev                 # starts at http://localhost:5173
```

Press **D** or click **▶ Run demo** to trigger the demo flow without an API key.

## Tech decisions

- **Vite + React, not Next.js** — this is a demo prototype, not a deployed app. No SSR needed. Vite's dev server starts in under 300ms and the build is a single static bundle.
- **No component library** — the validation logic and routing taxonomy are the point, not the UI framework. Every pixel is intentional and explainable in an interview.
- **IBM Plex Mono** — this is an ops tool. Monospace reinforces the "machine reading documents" framing and distinguishes it from every dashboard template that uses Inter or DM Sans.

## Stack

React 18, Vite, no other runtime dependencies.

AI extraction is mocked — in a real deployment this calls the Anthropic API (`claude-opus-4-5`, `/v1/messages`, vision content block). The mock returns pre-baked extraction data from the actual Matheson Tri-Gas and Sharpgas invoices used in the original project. See `src/utils/extractInvoice.js` for the real implementation skeleton.
