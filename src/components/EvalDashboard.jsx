import { weeklyEvalData, exceptionByVendor } from '../data/invoices.js';

const CHART_H = 170;
const BAR_W   = 38;
const BAR_GAP = 20;

const STAT_PASTELS = [
  { label: 'Straight Through', bucketKey: 'STRAIGHT_THROUGH', color: '#059669', bg: '#dcfce7', border: '#6ee7b7' },
  { label: 'Auto-Corrected',   bucketKey: 'AUTO_CORRECTED',   color: '#0891b2', bg: '#cffafe', border: '#67e8f9' },
  { label: 'Human Review',     bucketKey: 'HUMAN_REVIEW',     color: '#d97706', bg: '#fef9c3', border: '#fde68a' },
  { label: 'Auto-Rejected',    bucketKey: 'AUTO_REJECTED',    color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
];

export default function EvalDashboard({ results }) {
  const counts = { STRAIGHT_THROUGH: 0, AUTO_CORRECTED: 0, HUMAN_REVIEW: 0, AUTO_REJECTED: 0 };
  results.forEach(r => counts[r.bucket]++);
  const total = results.length || 1;

  const maxVendorCount = Math.max(...exceptionByVendor.map(v => v.count));
  const svgWidth = weeklyEvalData.length * (BAR_W + BAR_GAP) + BAR_GAP;

  return (
    <div style={{ padding: '28px 36px', maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* Live batch stats */}
      <div>
        <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          Live Batch
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          {results.length} invoices processed at current tolerance setting
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {STAT_PASTELS.map(s => {
            const count = counts[s.bucketKey];
            const pct = Math.round(count / total * 100);
            return (
              <div key={s.label} style={{
                flex: '1 1 160px',
                background: s.bg,
                border: `1.5px solid ${s.border}`,
                borderRadius: 10,
                padding: '18px 20px',
              }}>
                <div style={{ color: s.color, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{count}</div>
                <div style={{ color: s.color, fontSize: 14, fontWeight: 600, marginTop: 6 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 13, marginTop: 4, opacity: 0.8 }}>{pct}% of batch</div>
              </div>
            );
          })}
        </div>
      </div>

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
