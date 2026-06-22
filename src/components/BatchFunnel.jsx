import { STAGES, STAGE_LABELS, STATUS_META } from '../pipeline/model.js';

/**
 * BatchFunnel — the optional "Pipeline view" (UI redesign).
 *
 * The headline numbers now live in KpiCards; this is the engineer's drill-down,
 * shown only when the operator expands "Pipeline view". One card per stage with a
 * stacked status bar + the % needing review; clicking a segment filters the queue
 * to exactly "what didn't go through at this stage".
 */

const SEGMENTS = ['passed', 'auto_resolved', 'needs_review', 'failed'];

export default function BatchFunnel({ batch, activeFilter, onSegmentClick }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '16px 18px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {STAGES.map((stage, idx) => {
          const t = batch.funnel[stage];
          const inN = t.in || 0;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {idx + 1} · {STAGE_LABELS[stage]}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>in {inN.toLocaleString()}</span>
                </div>

                {/* Stacked segmented bar */}
                <div style={{ display: 'flex', height: 24, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface2)' }}>
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
                          width: `${pct}%`, background: meta.color, border: 'none',
                          borderRight: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer',
                          opacity: isActive ? 1 : 0.88, outline: isActive ? '2px solid var(--text)' : 'none', outlineOffset: -2,
                          color: '#fff', fontSize: 11, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap',
                        }}
                      >
                        {pct > 9 ? meta.icon : ''}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.reviewPct > 0 ? 'var(--amber)' : 'var(--faint)' }}>
                    ⚠ {t.reviewPct.toFixed(1)}% HITL
                  </span>
                  {t.failed > 0 && <span style={{ fontSize: 12, color: 'var(--red)' }}>✕ {t.failed.toLocaleString()}</span>}
                </div>
              </div>

              {idx < STAGES.length - 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 12px', minWidth: 50 }}>
                  <span style={{ fontSize: 18, color: '#cdd2e2', lineHeight: 1 }}>→</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{t.flowOn.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
