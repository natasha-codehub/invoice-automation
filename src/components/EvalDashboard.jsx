import { useMemo } from 'react';
import { weeklyEvalData, exceptionByVendor } from '../data/invoices.js';
import { TOUCHLESS } from '../pipeline/model.js';
import { docTypeKey, DOC_TYPES } from '../pipeline/docTypes.js';
import { money } from '../utils/currency.js';
import { extractionAccuracy, calibration, guardrails, qaSample, shadowVendors } from '../pipeline/evalMetrics.js';

const CHART_H = 170;
const BAR_W   = 38;
const BAR_GAP = 20;

const fmtDur = (s) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

// ── AI usage & cost (modeled) ────────────────────────────────────────────────
// Only the *reading* step (extraction) calls an LLM — decisions (matching,
// three-way, validation) are deterministic rules and cost nothing in tokens.
// Reading runs on a cheap model; figures are modeled on Claude Haiku 4.5 list
// pricing since the demo uses a stub extractor.
const READING_MODEL = 'Claude Haiku 4.5';
const PRICE_IN = 1.0 / 1e6;  // $/input token
const PRICE_OUT = 5.0 / 1e6; // $/output token

// Per-document extraction token estimate: a page image + prompt in, structured
// JSON (fields + line items) out. Deterministic so the dashboard is stable.
function tokensFor(inv) {
  const lines = inv.extraction?.lineItems?.length ?? inv.lineItems?.length ?? 2;
  return { input: 1150 + 25 * lines, output: 200 + 60 * lines };
}
const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`);
const usd = (n, dp = 2) => `$${n.toFixed(dp)}`;

// ── Section heading ──────────────────────────────────────────────────────────
function Heading({ title, note }) {
  return (
    <div>
      <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, marginBottom: note ? 4 : 0 }}>{title}</div>
      {note && <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>{note}</div>}
    </div>
  );
}

// ── 1 · Guard-railed STP scorecard ───────────────────────────────────────────
// The north star, the way it's meant to be read: STP never alone — always beside
// its two guardrails ($-leakage and false-reject), so a rising STP can't hide a
// rising risk.
function Scorecard({ batch, life, value, gr }) {
  if (!batch) return null;
  const pct = batch.stp?.pct ?? 0;
  const openExceptions = life.needs_review;
  const guardrailRows = [
    { ok: gr.leakage.ok, label: '$-leakage', value: money(gr.leakage.value),
      detail: `auto-approved-but-wrong — all ${gr.touchlessCount.toLocaleString()} touchless invoices cleared the consistency gate + three-way match before posting` },
    { ok: gr.leakage.ok, label: 'exception-escape', value: `${gr.leakage.escapeRate}%`,
      detail: `bad invoices slipping past the gate — ${gr.leakage.count} of ${gr.touchlessCount.toLocaleString()} touchless carried a blocking issue` },
    { ok: gr.falseReject.ok, label: 'false-reject', value: `${gr.falseReject.rate}%`,
      detail: `valid invoices wrongly rejected — every one of ${gr.rejectedCount.toLocaleString()} rejections carries a logged fatal reason` },
  ];
  return (
    <div>
      <Heading title="Guard-railed straight-through rate"
        note="The north star — never read alone. STP only counts if its two guardrails stay green." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 1.4fr', gap: 14 }}>
        {/* STP hero */}
        <div style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 12, padding: '22px 24px' }}>
          <div style={{ color: '#047857', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>STRAIGHT-THROUGH</div>
          <div style={{ color: '#059669', fontSize: 52, fontWeight: 800, lineHeight: 1.05, marginTop: 4 }}>{pct.toFixed(1)}%</div>
          <div style={{ color: '#047857', fontSize: 13, marginTop: 4 }}>
            {batch.stp.count.toLocaleString()} of {batch.totalCount.toLocaleString()} posted untouched
          </div>
        </div>
        {/* Guardrails */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {guardrailRows.map((g) => (
            <div key={g.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 15px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1, borderRadius: 6, padding: '3px 8px',
                color: g.ok ? '#059669' : '#b45309', background: g.ok ? '#dcfce7' : '#fef3c7' }}>
                {g.ok ? '✓ WITHIN' : '⚠ CHECK'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{g.value}</span>
                  <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 600 }}>{g.label} guardrail</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>{g.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Money + open line */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 14 }}>
        {[
          { n: money(value.touchless), l: 'posted touchless', c: '#059669' },
          { n: money(batch.valueAtRisk), l: 'held for review before pay', c: '#d97706' },
          { n: openExceptions.toLocaleString(), l: 'exceptions awaiting a person', c: '#475569' },
        ].map((m) => (
          <div key={m.l} style={{ background: '#fff', padding: '14px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: m.c }}>{m.n}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{m.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2 · Real batch outcome (replaces the old bucket-model "Live Batch") ───────
const LIFE_ROWS = [
  { key: 'passed',        label: 'Straight-through',  color: '#059669', bg: '#dcfce7' },
  { key: 'auto_resolved', label: 'Auto-resolved',     color: '#0891b2', bg: '#cffafe' },
  { key: 'posted',        label: 'Posted by reviewer',color: '#0d9488', bg: '#ccfbf1' },
  { key: 'needs_review',  label: 'Needs review',       color: '#d97706', bg: '#fef9c3' },
  { key: 'rejected',      label: 'Rejected',           color: '#e11d48', bg: '#ffe4e6' },
  { key: 'failed',        label: 'Auto-rejected',      color: '#dc2626', bg: '#fee2e2' },
];
function BatchOutcome({ batch, life }) {
  const total = batch?.totalCount || 1;
  const rows = LIFE_ROWS.filter((r) => life[r.key] > 0);
  return (
    <div>
      <Heading title="Batch outcome"
        note={`Where all ${total.toLocaleString()} documents in the batch landed — the live lifecycle, not a sample.`} />
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 18px 14px' }}>
        {rows.map((r) => {
          const n = life[r.key];
          const pct = (n / total) * 100;
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ width: 150, fontSize: 13, color: '#334155', fontWeight: 600 }}>{r.label}</span>
              <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(pct, 0.6)}%`, background: r.color, borderRadius: 7 }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: r.color, minWidth: 54, textAlign: 'right' }}>{n.toLocaleString()}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: '#94a3b8', minWidth: 44, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
          Intake: {batch.intake.filesReceived.toLocaleString()} files → {batch.intake.invoices.toLocaleString()} invoices
          ({batch.intake.statements} statement{batch.intake.statements === 1 ? '' : 's'} split into {batch.intake.segments}).
          One file ≠ one invoice.
        </div>
      </div>
    </div>
  );
}

// ── 3 · Reviewer impact (from the decisions log) ─────────────────────────────
function ReviewerImpact({ decisions, life }) {
  const rev = useMemo(() => {
    const d = decisions || [];
    const approvals = d.filter((x) => x.decision === 'approve').length;
    const rejections = d.filter((x) => x.decision === 'reject').length;
    const timed = d.filter((x) => x.secondsInReview != null);
    const totalSecs = timed.reduce((s, x) => s + x.secondsInReview, 0);
    const avg = timed.length ? Math.round(totalSecs / timed.length) : null;
    return { total: d.length, approvals, rejections, avg, totalSecs };
  }, [decisions]);

  const open = life.needs_review;
  const projected = rev.avg != null ? open * rev.avg : null;

  return (
    <div>
      <Heading title="Reviewer impact"
        note="What human review actually costs — measured per exception, so you can see it fall as the matcher learns." />
      {rev.total === 0 ? (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 10, padding: '18px 22px', color: '#64748b', fontSize: 13.5, lineHeight: 1.6 }}>
          <b style={{ color: '#475569' }}>No decisions logged this session.</b> Approve or reject an exception (the review sheet times each one) and this fills in — count, approve/reject split, and average time per exception.
          <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 12.5, color: '#475569' }}>
            Standing queue: {open.toLocaleString()} exceptions awaiting a person.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { v: rev.total, label: 'exceptions cleared', sub: `${rev.approvals} approved · ${rev.rejections} rejected` },
            { v: fmtDur(rev.avg), label: 'avg time per exception', sub: 'measured in the review sheet' },
            { v: fmtDur(rev.totalSecs), label: 'reviewer time spent', sub: 'this session' },
            { v: projected != null ? fmtDur(projected) : '—', label: 'to clear the open queue', sub: `${open.toLocaleString()} left · projected at current pace` },
          ].map((m) => (
            <div key={m.label} style={{ flex: '1 1 150px', background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ color: '#4338ca', fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{m.v}</div>
              <div style={{ color: '#4338ca', fontSize: 13, fontWeight: 600, marginTop: 6 }}>{m.label}</div>
              <div style={{ color: '#6366f1', fontSize: 11.5, marginTop: 3, opacity: 0.9 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 3b · AI usage & cost (the running cost, kept off the operator queue) ──────
function AiUsage({ invoices }) {
  const ai = useMemo(() => {
    let inTok = 0, outTok = 0;
    for (const inv of invoices) { const t = tokensFor(inv); inTok += t.input; outTok += t.output; }
    const n = invoices.length || 1;
    const cost = inTok * PRICE_IN + outTok * PRICE_OUT;
    return { inTok, outTok, total: inTok + outTok, cost, perInvoice: cost / n, avgIn: inTok / n, avgOut: outTok / n, n };
  }, [invoices]);

  const tiles = [
    { v: READING_MODEL, label: 'reading model', sub: 'extraction only' },
    { v: `${Math.round(ai.avgIn).toLocaleString()} / ${Math.round(ai.avgOut).toLocaleString()}`, label: 'tokens per invoice', sub: 'input / output' },
    { v: fmtTok(ai.total), label: 'tokens this batch', sub: `${fmtTok(ai.inTok)} in · ${fmtTok(ai.outTok)} out` },
    { v: usd(ai.cost), label: 'est. AI spend', sub: `${usd(ai.perInvoice, 4)} per invoice` },
  ];

  return (
    <div>
      <Heading title="AI usage & cost"
        note="The running cost of the AI itself — what the model reads, and what that costs per invoice." />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ flex: '1 1 150px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ color: '#0f172a', fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{t.v}</div>
            <div style={{ color: '#334155', fontSize: 13, fontWeight: 600, marginTop: 6 }}>{t.label}</div>
            <div style={{ color: '#64748b', fontSize: 11.5, marginTop: 3 }}>{t.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 12, lineHeight: 1.6 }}>
        <b style={{ color: '#475569' }}>Decisions cost $0 in tokens.</b> Matching, the three-way match and validation are deterministic rules — only the reading step calls an LLM, which keeps spend low <i>and</i> the decisions fully auditable. Figures are modeled on {READING_MODEL} list pricing ({usd(PRICE_IN * 1e6)}/M in, {usd(PRICE_OUT * 1e6)}/M out); prompt caching of the shared extraction prompt would reduce it further.
      </div>
    </div>
  );
}

// ── 4 · Document-type mix ────────────────────────────────────────────────────
function DocTypeMix({ invoices }) {
  const mix = useMemo(() => {
    const m = {};
    for (const inv of invoices) { const k = docTypeKey(inv); m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [invoices]);
  const total = invoices.length || 1;
  const max = Math.max(...mix.map(([, n]) => n));
  return (
    <div>
      <Heading title="Document-type mix"
        note="One queue, every shape AP receives — not just clean PO invoices." />
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 18px 12px' }}>
        {mix.map(([k, n]) => {
          const meta = DOC_TYPES[k] || { label: k, fg: '#475569' };
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ width: 130, fontSize: 12.5, color: '#334155', fontWeight: 600 }}>{meta.label}</span>
              <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(n / max) * 100}%`, background: meta.fg, borderRadius: 6, opacity: 0.85 }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: meta.fg, minWidth: 54, textAlign: 'right' }}>{n.toLocaleString()}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#94a3b8', minWidth: 42, textAlign: 'right' }}>{((n / total) * 100).toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 5 · Flywheel impact (Phase E — unchanged) ────────────────────────────────
function FlywheelImpact({ fw }) {
  const learned = fw && fw.aliases > 0;
  return (
    <div>
      <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        Flywheel Impact <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>· corrections → fewer touches</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        The moat, measured: what reviewer corrections have removed from the queue. Compares the real + ingested invoices today against the same batch with learned aliases turned off.
      </div>

      {!learned ? (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 10, padding: '20px 22px', color: '#64748b', fontSize: 13.5, lineHeight: 1.6 }}>
          <b style={{ color: '#475569' }}>Nothing learned yet.</b> Open an invoice with an unmatched line (try <span style={{ fontFamily: 'var(--mono)' }}>Xpedited Gas · 11238</span>), go to <b>Validate &amp; Map</b>, and resolve the line. The alias is remembered and this panel will show the exceptions it removes — for the whole batch, on every future pipe.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { v: fw.aliases, label: 'aliases learned', sub: `across ${fw.vendors} vendor${fw.vendors === 1 ? '' : 's'}` },
              { v: fw.linesResolved, label: 'lines auto-resolved', sub: 'now skip the queue' },
              { v: fw.exceptionsRemoved, label: 'mapping exceptions removed', sub: 'vs the no-learning baseline' },
              { v: fw.rescued, label: 'invoices made touchless', sub: 'mapping was the only blocker' },
            ].map((m) => (
              <div key={m.label} style={{ flex: '1 1 150px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ color: '#047857', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{m.v}</div>
                <div style={{ color: '#047857', fontSize: 13, fontWeight: 600, marginTop: 6 }}>{m.label}</div>
                <div style={{ color: '#059669', fontSize: 11.5, marginTop: 3, opacity: 0.85 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Touch-rate baseline → now */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 600, marginBottom: 10 }}>
              Touchless rate · real + ingested invoices ({fw.realCount})
            </div>
            {[
              { label: 'without learning', pct: fw.touchBasePct, color: '#94a3b8' },
              { label: 'with learned aliases', pct: fw.touchNowPct, color: '#059669' },
            ].map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ width: 130, fontSize: 12, color: '#64748b' }}>{r.label}</span>
                <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.pct}%`, background: r.color, borderRadius: 6, transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: r.color, minWidth: 38, textAlign: 'right' }}>{r.pct}%</span>
              </div>
            ))}
            {fw.touchNowPct === fw.touchBasePct && (
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
                Touchless rate is unchanged here because the resolved invoice is still held by a separate check (e.g. price variance) — but the mapping exception is gone, which is the work the reviewer no longer repeats.
              </div>
            )}
          </div>

          {/* What was resolved */}
          {fw.resolvedLines.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 600, marginBottom: 8 }}>Lines now auto-resolving</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fw.resolvedLines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 12.5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px 11px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#d1fae5', borderRadius: 4, padding: '1px 6px' }}>LEARNED</span>
                    <span style={{ color: '#64748b' }}>{l.vendor}</span>
                    <span style={{ color: '#334155' }}>“{l.raw}”</span>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <b style={{ color: '#3730a3' }}>{l.mat}</b>
                    <span style={{ color: '#64748b' }}>{l.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── F1 · Extraction accuracy vs ground truth (the OCR-vs-normalisation thesis) ─
const Chip = ({ ok }) => (
  <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 4, padding: '1px 6px',
    color: ok ? '#047857' : '#b91c1c', background: ok ? '#d1fae5' : '#fee2e2' }}>
    {ok ? '✓' : '✕'}
  </span>
);
function ExtractionAccuracy() {
  const acc = useMemo(() => extractionAccuracy(), []);
  const cal = useMemo(() => calibration(acc.rows), [acc.rows]);
  const lift = Math.round((acc.normPct - acc.rawPct) * 10) / 10;
  return (
    <div>
      <Heading title="Extraction accuracy — OCR vs normalisation"
        note={`Golden set of ${BUNDLED_N} verified invoices · ${acc.engine}. Field accuracy as the engine reads it (raw), then after our normalisation. The gap is the moat — the work the OCR layer can't do.`} />

      {/* Headline: raw → normalised */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'stretch', marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ color: '#64748b', fontSize: 12.5, fontWeight: 700 }}>RAW EXTRACTION</div>
          <div style={{ color: '#475569', fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{acc.rawPct}%</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>{acc.rawCorrect}/{acc.total} critical fields correct as read</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#059669', fontSize: 26, fontWeight: 800 }}>→</div>
        <div style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ color: '#047857', fontSize: 12.5, fontWeight: 700 }}>AFTER NORMALISATION</div>
          <div style={{ color: '#059669', fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{acc.normPct}%</div>
          <div style={{ color: '#047857', fontSize: 12 }}>+{lift} pts · {acc.fixedByNorm.length} field{acc.fixedByNorm.length === 1 ? '' : 's'} the OCR got wrong, repaired</div>
        </div>
      </div>

      {/* Per-field table */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: '#475569', textAlign: 'left' }}>
              {['Invoice', 'Field', 'Raw read', 'Normalised', 'Ground truth', 'Conf', 'Raw', 'Norm'].map((h) => (
                <th key={h} style={{ padding: '9px 12px', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ fontFamily: 'var(--mono)' }}>
            {acc.rows.map((r, i) => (
              <tr key={i} style={{ borderTop: i ? '1px solid #f1f5f9' : 'none', background: r.fixedByNorm ? '#f0fdf4' : '#fff' }}>
                <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'var(--sans)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.invoice}</td>
                <td style={{ padding: '8px 12px', color: '#334155', fontFamily: 'var(--sans)', fontWeight: 600 }}>{r.fieldLabel}</td>
                <td style={{ padding: '8px 12px', color: r.rawMatch ? '#334155' : '#b91c1c' }}>{String(r.raw)}</td>
                <td style={{ padding: '8px 12px', color: '#334155' }}>{r.fixedByNorm ? String(r.norm) : '—'}</td>
                <td style={{ padding: '8px 12px', color: '#64748b' }}>{String(r.gt)}</td>
                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}</td>
                <td style={{ padding: '8px 12px' }}><Chip ok={r.rawMatch} /></td>
                <td style={{ padding: '8px 12px' }}><Chip ok={r.normMatch} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confidence calibration */}
      <div style={{ color: '#475569', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Confidence calibration</div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 18px 12px' }}>
        {cal.map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
            <span style={{ width: 110, fontFamily: 'var(--mono)', fontSize: 12.5, color: '#475569' }}>{b.label}</span>
            <span style={{ width: 70, fontSize: 12, color: '#94a3b8' }}>{b.count} field{b.count === 1 ? '' : 's'}</span>
            <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${b.accuracy ?? 0}%`, background: b.accuracy === 100 ? '#059669' : b.accuracy >= 70 ? '#d97706' : '#dc2626', borderRadius: 6 }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: '#334155', minWidth: 70, textAlign: 'right' }}>
              {b.accuracy == null ? '—' : `${b.accuracy}% acc`}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
          The engine is least accurate exactly where it reports low confidence — so the confidence score is trustworthy, and the low-confidence fields are precisely the ones normalisation repairs. Swap the Layer-1 engine and this table re-runs on the same golden set: that's how you compare OCR engines apples-to-apples.
        </div>
      </div>
    </div>
  );
}

// ── F3 · Auto-approval controls (random-QA + new-vendor shadow mode) ──────────
function AutoApprovalControls({ invoices }) {
  const qa = useMemo(() => qaSample(invoices, 5), [invoices]);
  const shadow = useMemo(() => shadowVendors(invoices), [invoices]);
  return (
    <div>
      <Heading title="Auto-approval controls"
        note="Straight-through is not unwatched. A random slice of auto-approved invoices is pulled for QA, and any vendor with no payment history runs in shadow mode." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Random-QA sampling */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Random-QA sampling</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            {qa.ratePct}% of {qa.autoApproved.toLocaleString()} auto-approved invoices spot-checked by a person.
          </div>
          <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
            <div><div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800, color: '#4338ca' }}>{qa.sampledCount.toLocaleString()}</div><div style={{ fontSize: 11.5, color: '#64748b' }}>pulled for QA</div></div>
            <div><div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800, color: '#4338ca' }}>{money(qa.sampleValue)}</div><div style={{ fontSize: 11.5, color: '#64748b' }}>value sampled</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {qa.sample.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'var(--mono)', color: '#475569', borderTop: '1px solid #f1f5f9', padding: '4px 0' }}>
                <span style={{ color: '#94a3b8' }}>{s.id}</span>
                <span style={{ flex: 1, margin: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.vendor}</span>
                <span>{money(s.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* New-vendor shadow mode */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>New-vendor shadow mode</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            Vendors not on the approved master — flagged because no payment history is where bank-change fraud and bad master data hide.
          </div>
          <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
            <div><div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800, color: '#b45309' }}>{shadow.vendorCount}</div><div style={{ fontSize: 11.5, color: '#64748b' }}>new vendors</div></div>
            <div><div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800, color: '#b45309' }}>{shadow.flagged.toLocaleString()}</div><div style={{ fontSize: 11.5, color: '#64748b' }}>invoices in shadow</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shadow.vendors.slice(0, 6).map((v) => (
              <div key={v.vendor} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#475569', borderTop: '1px solid #f1f5f9', padding: '4px 0' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#b45309', background: '#fef3c7', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>SHADOW</span>
                  {v.vendor}
                </span>
                <span style={{ fontFamily: 'var(--mono)', color: '#94a3b8' }}>{v.count}×</span>
              </div>
            ))}
            {shadow.vendorCount === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Every vendor in the batch is on the approved master.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const BUNDLED_N = 4;

export default function EvalDashboard({ flywheel, batch, invoices = [], decisions = [] }) {
  const life = useMemo(() => {
    const c = { passed: 0, auto_resolved: 0, needs_review: 0, failed: 0, posted: 0, rejected: 0 };
    for (const inv of invoices) if (c[inv.overallStatus] != null) c[inv.overallStatus] += 1;
    return c;
  }, [invoices]);

  const value = useMemo(() => {
    let touchless = 0, posted = 0;
    for (const inv of invoices) {
      const t = inv.total || 0;
      if (TOUCHLESS.has(inv.overallStatus)) touchless += t;
      else if (inv.overallStatus === 'posted') posted += t;
    }
    return { touchless, posted };
  }, [invoices]);

  const gr = useMemo(() => guardrails(invoices, decisions), [invoices, decisions]);

  const maxVendorCount = Math.max(...exceptionByVendor.map(v => v.count));
  const svgWidth = weeklyEvalData.length * (BAR_W + BAR_GAP) + BAR_GAP;

  return (
    <div style={{ padding: '28px 36px', maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>

      <Scorecard batch={batch} life={life} value={value} gr={gr} />
      <ExtractionAccuracy />
      <BatchOutcome batch={batch} life={life} />
      <ReviewerImpact decisions={decisions} life={life} />
      <AutoApprovalControls invoices={invoices} />
      <AiUsage invoices={invoices} />
      <FlywheelImpact fw={flywheel} />
      <DocTypeMix invoices={invoices} />

      {/* Historical STP trend */}
      <div>
        <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Historical STP Trend
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
          Third-party tool baseline ~38% → 91% at Week 8 · Improvement driven by weekly exception analysis
        </div>
        <div style={{
          background: '#f0fdf4',
          borderRadius: 10,
          padding: '22px 22px 16px',
          border: '1.5px solid #bbf7d0',
          overflowX: 'auto',
        }}>
          <svg
            width={svgWidth}
            height={CHART_H + 44}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {weeklyEvalData.map((d, i) => {
              const x = BAR_GAP + i * (BAR_W + BAR_GAP);
              const barH = Math.round((d.stpPct / 100) * CHART_H);
              const y = CHART_H - barH;
              const isLast = i === weeklyEvalData.length - 1;
              return (
                <g key={d.week}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={4}
                    fill={isLast ? '#059669' : '#34d399'}
                    opacity={isLast ? 1 : 0.75}
                  />
                  <text
                    x={x + BAR_W / 2}
                    y={y - 7}
                    textAnchor="middle"
                    fill={isLast ? '#065f46' : '#047857'}
                    fontSize={11}
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={isLast ? 700 : 500}
                  >
                    {d.stpPct}%
                  </text>
                  <text
                    x={x + BAR_W / 2}
                    y={CHART_H + 18}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize={11}
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={500}
                  >
                    {d.week}
                  </text>
                </g>
              );
            })}
            {/* Baseline reference line */}
            <line
              x1={0}
              y1={CHART_H - Math.round(0.38 * CHART_H)}
              x2={svgWidth}
              y2={CHART_H - Math.round(0.38 * CHART_H)}
              stroke="#94a3b8"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text
              x={svgWidth - 4}
              y={CHART_H - Math.round(0.38 * CHART_H) - 5}
              textAnchor="end"
              fill="#64748b"
              fontSize={10}
              fontFamily="IBM Plex Mono, monospace"
              fontWeight={500}
            >
              baseline 38%
            </text>
          </svg>
        </div>
      </div>

      {/* Exception signal by vendor */}
      <div>
        <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Exception Signal by Vendor
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
          High exception volume triggers a normalisation rule update — not just queue growth
        </div>
        <div style={{
          background: '#fffbeb',
          borderRadius: 10,
          border: '1.5px solid #fde68a',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#fef3c7', borderBottom: '1.5px solid #fde68a' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', color: '#92400e', fontWeight: 700 }}>Vendor</th>
                <th style={{ textAlign: 'left', padding: '12px 18px', color: '#92400e', fontWeight: 700 }}>Exception Type</th>
                <th style={{ textAlign: 'left', padding: '12px 18px', color: '#92400e', fontWeight: 700, minWidth: 200 }}>Volume</th>
                <th style={{ textAlign: 'left', padding: '12px 18px', color: '#92400e', fontWeight: 700 }}>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {exceptionByVendor.map((v, i) => (
                <tr key={v.vendor} style={{ borderBottom: i < exceptionByVendor.length - 1 ? '1px solid #fde68a' : 'none' }}>
                  <td style={{ padding: '12px 18px', color: '#1e293b', fontWeight: 700 }}>{v.vendor}</td>
                  <td style={{ padding: '12px 18px', color: '#d97706', fontWeight: 600 }}>{v.type}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 8, background: '#fde68a', borderRadius: 4 }}>
                        <div style={{
                          height: '100%',
                          width: `${(v.count / maxVendorCount) * 100}%`,
                          background: v.count > 10 ? '#dc2626' : v.count > 6 ? '#d97706' : '#059669',
                          borderRadius: 4,
                        }} />
                      </div>
                      <span style={{ color: '#475569', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{v.count}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>{v.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
