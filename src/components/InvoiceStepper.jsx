import { STAGES, STAGE_LABELS, STATUS_META } from '../pipeline/model.js';

export default function InvoiceStepper({ pinv, activeStage, onStageClick }) {
  if (!pinv) return null;
  const active = activeStage || pinv.stoppedAt;
  const activeResult = pinv.stages[active];

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: '#fafbff', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 20px 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{pinv.vendorName}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{pinv.id}</span>
        {pinv.total != null && <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>₹{pinv.total.toLocaleString()}</span>}
      </div>

      {/* Provenance subline — for invoices split out of a multi-invoice statement (Phase D) */}
      {pinv.provenance?.kind === 'statement-segment' && (
        <div style={{ padding: '0 20px 6px', fontSize: 11, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>↳</span>
          <span>
            segment <b>{pinv.provenance.segmentIndex}/{pinv.provenance.segmentCount}</b> of statement{' '}
            <span style={{ fontWeight: 600 }}>{pinv.provenance.sourceFile}</span> · source page{' '}
            <b>{pinv.provenance.sourcePage}</b> of {pinv.provenance.pageCount} ({pinv.provenance.lineRange})
          </span>
        </div>
      )}

      {/* Stepper nodes */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 14px' }}>
        {STAGES.map((stage, idx) => {
          const m = STATUS_META[pinv.stages[stage]?.status || 'pending'];
          const isActive = stage === active;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: idx < STAGES.length - 1 ? 1 : 'none' }}>
              <button
                onClick={() => onStageClick(stage)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: '50%', background: m.bg, color: m.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                  border: `2px solid ${isActive ? m.color : 'transparent'}`,
                }}>
                  {m.icon}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 600, color: isActive ? '#1e293b' : '#64748b' }}>
                    {idx + 1}. {STAGE_LABELS[stage]}
                  </span>
                  <span style={{ fontSize: 10, color: m.color, fontWeight: 600 }}>{m.label}</span>
                </span>
              </button>
              {idx < STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: '#e2e8f0', margin: '0 10px' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Active stage issues */}
      <div style={{ padding: '0 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
            {STAGE_LABELS[active]} — {STATUS_META[activeResult?.status || 'pending'].label}
          </span>
          {activeResult?.confidence != null && (
            <span style={{ fontSize: 12, color: '#4f46e5' }}>conf {Math.round(activeResult.confidence * 100)}%</span>
          )}
        </div>
        {activeResult?.issues?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeResult.issues.map((iss, i) => (
              <div key={i} style={{
                fontSize: 12, lineHeight: 1.4,
                color: iss.severity === 'error' ? '#dc2626' : iss.severity === 'warn' ? '#d97706' : '#64748b',
              }}>
                {iss.severity === 'error' ? '✕' : iss.severity === 'warn' ? '⚠' : '·'} {iss.message}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {activeResult?.status === 'pending' ? 'Stage not reached — invoice stopped earlier.' : 'No issues at this stage.'}
          </div>
        )}
      </div>
    </div>
  );
}
