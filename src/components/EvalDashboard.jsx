import { weeklyEvalData, exceptionByVendor } from '../data/invoices.js';

const CHART_H = 160;
const BAR_W   = 36;
const BAR_GAP = 18;

export default function EvalDashboard({ results }) {
  const counts = { STRAIGHT_THROUGH: 0, AUTO_CORRECTED: 0, HUMAN_REVIEW: 0, AUTO_REJECTED: 0 };
  results.forEach(r => counts[r.bucket]++);
  const total = results.length || 1;

  const statCards = [
    { label: 'Straight Through', count: counts.STRAIGHT_THROUGH, color: 'var(--green)',  pct: Math.round(counts.STRAIGHT_THROUGH / total * 100) },
    { label: 'Auto-Corrected',   count: counts.AUTO_CORRECTED,   color: '#06b6d4',       pct: Math.round(counts.AUTO_CORRECTED   / total * 100) },
    { label: 'Human Review',     count: counts.HUMAN_REVIEW,     color: 'var(--amber)',  pct: Math.round(counts.HUMAN_REVIEW     / total * 100) },
    { label: 'Auto-Rejected',    count: counts.AUTO_REJECTED,    color: 'var(--red)',    pct: Math.round(counts.AUTO_REJECTED    / total * 100) },
  ];

  const maxVendorCount = Math.max(...exceptionByVendor.map(v => v.count));
  const svgWidth = weeklyEvalData.length * (BAR_W + BAR_GAP) + BAR_GAP;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* 1. Product decision callout */}
      <div style={{
        border: '1px solid var(--purple)',
        borderLeft: '4px solid var(--purple)',
        background: 'var(--purple)0d',
        borderRadius: 6,
        padding: '16px 20px',
      }}>
        <div style={{ color: 'var(--purple)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 8 }}>
          PRODUCT DECISION
        </div>
        <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.7, maxWidth: 680 }}>
          The exception rate is not a failure metric — it's a feedback signal. Every invoice leaving straight-through
          processing is a data point. The 2% variance tolerance threshold is a dial, not a fixed rule.
          Each weekly review of exception patterns directly feeds the normalisation rule updates that drive STP improvement.
        </div>
      </div>

      {/* 2. Live batch stats */}
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 14 }}>
          LIVE BATCH — {results.length} INVOICES PROCESSED
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {statCards.map(s => (
            <div key={s.label} style={{
              flex: '1 1 160px',
              background: 'var(--surface)',
              border: `1px solid ${s.color}33`,
              borderTop: `3px solid ${s.color}`,
              borderRadius: 6,
              padding: '16px 18px',
            }}>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 600, lineHeight: 1 }}>{s.count}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 13, marginTop: 6, fontWeight: 500 }}>{s.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Historical STP trend — plain SVG */}
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
          HISTORICAL STP TREND
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 18 }}>
          Third-party tool baseline ~38% STP → 91% STP at Week 8 · Improvement driven by weekly exception analysis
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '20px 20px 14px', border: '1px solid var(--border)', overflowX: 'auto' }}>
          <svg
            width={svgWidth}
            height={CHART_H + 40}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {weeklyEvalData.map((d, i) => {
              const x = BAR_GAP + i * (BAR_W + BAR_GAP);
              const barH = Math.round((d.stpPct / 100) * CHART_H);
              const y = CHART_H - barH;
              const isLast = i === weeklyEvalData.length - 1;
              return (
                <g key={d.week}>
                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={3}
                    fill={isLast ? 'var(--green)' : 'var(--accent)'}
                    opacity={isLast ? 1 : 0.7}
                  />
                  {/* STP % label above bar */}
                  <text
                    x={x + BAR_W / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fill={isLast ? 'var(--green)' : 'var(--text-dim)'}
                    fontSize={10}
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={isLast ? 600 : 400}
                  >
                    {d.stpPct}%
                  </text>
                  {/* Week label below bar */}
                  <text
                    x={x + BAR_W / 2}
                    y={CHART_H + 16}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={10}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {d.week}
                  </text>
                </g>
              );
            })}
            {/* Baseline reference line at 38% */}
            <line
              x1={0}
              y1={CHART_H - Math.round(0.38 * CHART_H)}
              x2={svgWidth}
              y2={CHART_H - Math.round(0.38 * CHART_H)}
              stroke="var(--border2)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <text
              x={svgWidth - 4}
              y={CHART_H - Math.round(0.38 * CHART_H) - 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize={9}
              fontFamily="IBM Plex Mono, monospace"
            >
              baseline 38%
            </text>
          </svg>
        </div>
      </div>

      {/* 4. Exception signal by vendor */}
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
          EXCEPTION SIGNAL BY VENDOR
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 16 }}>
          High vendor exception volume → triggers custom normalisation rule, not just queue growth
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--muted)', fontWeight: 500 }}>Vendor</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--muted)', fontWeight: 500 }}>Exception Type</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--muted)', fontWeight: 500, minWidth: 200 }}>Volume</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--muted)', fontWeight: 500 }}>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {exceptionByVendor.map((v, i) => (
                <tr key={v.vendor} style={{ borderBottom: i < exceptionByVendor.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text)', fontWeight: 500 }}>{v.vendor}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--amber)', fontSize: 11 }}>{v.type}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border2)', borderRadius: 3 }}>
                        <div style={{
                          height: '100%',
                          width: `${(v.count / maxVendorCount) * 100}%`,
                          background: v.count > 10 ? 'var(--red)' : v.count > 6 ? 'var(--amber)' : 'var(--green)',
                          borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ color: 'var(--text-dim)', minWidth: 20, textAlign: 'right' }}>{v.count}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 11 }}>{v.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
