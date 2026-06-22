/**
 * KpiCards — the calm headline of the Document Queue (UI redesign).
 *
 * Four cards answer "what needs me?" in under a second: how big the batch is,
 * how much needs review (and the money behind it), what failed, and how much
 * flowed through untouched. Each card carries one context footnote drawn from
 * the batch intake summary so the numbers tell a story, not just a count.
 */

const money = (n) => `₹${Math.round(n || 0).toLocaleString()}`;

function Card({ label, value, foot, bar, val }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', position: 'relative', overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: bar }} />
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 27, fontWeight: 600, lineHeight: 1, color: val }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 7 }}>{foot}</div>
    </div>
  );
}

export default function KpiCards({ batch }) {
  const intake = batch.intake || {};
  const segFoot = intake.statements > 0
    ? `${intake.statements} statement${intake.statements > 1 ? 's' : ''} segmented into ${intake.segments}`
    : `${(intake.filesReceived ?? batch.totalCount).toLocaleString()} source files`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
      <Card label="Invoices in batch" value={batch.totalCount.toLocaleString()} foot={segFoot}
        bar="var(--accent)" val="var(--text)" />
      <Card label="Needs review" value={batch.needsReview.toLocaleString()} foot={`${money(batch.valueAtRisk)} value at risk`}
        bar="var(--amber)" val="var(--amber)" />
      <Card label="Failed" value={batch.failed.toLocaleString()} foot={`${(intake.rejectedAtIntake || 0).toLocaleString()} rejected at intake`}
        bar="var(--red)" val="var(--red)" />
      <Card label="Straight-through" value={`${batch.stp.pct.toFixed(1)}%`} foot={`${batch.stp.count.toLocaleString()} posted touchless`}
        bar="var(--green)" val="var(--green)" />
    </div>
  );
}
