import { STAGES, STAGE_LABELS, STATUS_META } from '../pipeline/model.js';

const SEGMENTS = ['passed', 'auto_resolved', 'needs_review', 'failed'];

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: color || '#1e293b', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.03em' }}>{label}</span>
    </div>
  );
}

export default function BatchFunnel({ batch, activeFilter, onSegmentClick }) {
  const money = (n) => `₹${Math.round(n).toLocaleString()}`;
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#fafbff' }}>
      {/* Summary strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginBottom: 16 }}>
        <Stat label="Invoices in batch" value={batch.totalCount.toLocaleString()} />
        <Stat label="Straight-through (touchless)" value={`${batch.stp.pct.toFixed(1)}%`} color="#059669" />
        <Stat label="Needs review" value={batch.needsReview.toLocaleString()} color="#d97706" />
        <Stat label="Failed" value={batch.failed.toLocaleString()} color="#dc2626" />
        <Stat label="Value at risk" value={money(batch.valueAtRisk)} color="#dc2626" />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
          Click a segment to filter the worklist
        </span>
      </div>

      {/* Funnel: one card per stage */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {STAGES.map((stage, idx) => {
          const t = batch.funnel[stage];
          const inN = t.in || 0;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    {idx + 1}. {STAGE_LABELS[stage]}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>in {inN.toLocaleString()}</span>
                </div>

                {/* Stacked segmented bar */}
                <div style={{ display: 'flex', height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                  {SEGMENTS.map((seg) => {
                    const count = t[seg] || 0;
                    if (!count) return null;
                    const pct = (count / inN) * 100;
                    const meta = STATUS_META[seg];
                    const isActive = activeFilter && activeFilter.stage === stage && activeFilter.status === seg;
                    return (
                      <button
                        key={seg}
                        onClick={() => onSegmentClick(stage, seg)}
                        title={`${meta.label}: ${count.toLocaleString()} (${pct.toFixed(1)}%)`}
                        style={{
                          width: `${pct}%`,
                          background: meta.color,
                          border: 'none',
                          borderRight: '1px solid rgba(255,255,255,0.5)',
                          cursor: 'pointer',
                          opacity: isActive ? 1 : 0.85,
                          outline: isActive ? '2px solid #1e293b' : 'none',
                          outlineOffset: -2,
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {pct > 9 ? meta.icon : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Per-stage callout */}
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.reviewPct > 0 ? '#d97706' : '#94a3b8' }}>
                    ⚠ {t.reviewPct.toFixed(1)}% HITL
                  </span>
                  {t.failed > 0 && (
                    <span style={{ fontSize: 12, color: '#dc2626' }}>✕ {t.failed.toLocaleString()}</span>
                  )}
                </div>
              </div>

              {/* Flow-on connector */}
              {idx < STAGES.length - 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 10px', minWidth: 56 }}>
                  <span style={{ fontSize: 18, color: '#cbd5e1', lineHeight: 1 }}>→</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{t.flowOn.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
