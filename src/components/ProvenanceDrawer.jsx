import { useEffect } from 'react';

/**
 * ProvenanceDrawer — Phase E4: the full per-field lineage for one invoice.
 *
 * Finance lives or dies on auditability: every value on an invoice should be
 * traceable from raw → normalised → mapped, with who/what touched it, the rule,
 * the confidence, and whether it's reversible. The trace entries already accrue
 * on each PipelineInvoice (segmentation, normalisation, mapping, and any human
 * edit carried across re-pipes); this just renders them as an immutable ledger.
 *
 * It deliberately surfaces the *human* edits alongside the machine steps — that's
 * the flywheel made auditable: you can see the moment a reviewer taught the system.
 */

// Actor → visual identity. Human + learned steps are the ones worth spotting.
function actorStyle(actor = '') {
  if (actor.startsWith('human')) return { label: actor.replace('human:', '👤 '), color: '#047857', bg: '#ecfdf5' };
  if (actor.startsWith('engine')) return { label: actor.replace('engine:', '⚙ '), color: '#6d28d9', bg: '#f5f3ff' };
  if (actor.startsWith('map')) return { label: actor.replace('map:', '🔗 '), color: '#4f46e5', bg: '#e0e7ff' };
  if (actor.startsWith('rule')) return { label: actor.replace('rule:', '📐 '), color: '#64748b', bg: '#f1f5f9' };
  return { label: actor || '—', color: '#64748b', bg: '#f1f5f9' };
}

function when(ts) {
  if (!ts) return null;
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return null; }
}

export default function ProvenanceDrawer({ pinv, open, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, onClose]);

  const traces = pinv?.traces || [];

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{
        position: 'fixed', inset: 0, background: 'rgba(20,24,45,0.32)', zIndex: 70,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.2s ease',
      }} />
      <aside role="dialog" aria-modal="true" aria-label="Provenance trace" style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: 480, maxWidth: '94vw',
        background: 'var(--surface)', boxShadow: '-12px 0 40px rgba(20,24,45,0.22)', zIndex: 71,
        display: 'flex', flexDirection: 'column', pointerEvents: open ? 'auto' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.24s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            🧾 Provenance · <span style={{ color: 'var(--muted)' }}>{pinv?.extraction?.invoiceNumber || pinv?.id}</span>
          </span>
          <button onClick={onClose} aria-label="Close trace" style={{ background: 'none', border: 'none', fontSize: 22, lineHeight: 1, padding: '2px 7px', color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
            Immutable per-field lineage — every step that touched this invoice, in order, with actor, rule, and confidence. Human edits appear inline with the machine steps.
          </p>
          {traces.length === 0 ? (
            <div style={{ color: 'var(--faint)', fontSize: 13, textAlign: 'center', padding: 24 }}>No trace entries yet.</div>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
              {traces.map((t, i) => {
                const a = actorStyle(t.actor);
                const ts = when(t.learnedAt || t.ts);
                return (
                  <li key={i} style={{ display: 'flex', gap: 11, paddingBottom: 14, position: 'relative' }}>
                    {/* rail */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, marginTop: 4 }} />
                      {i < traces.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 2 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#334155' }}>{t.field || '—'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, color: a.color, background: a.bg }}>{a.label}</span>
                        {t.learned && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, color: '#047857', background: '#d1fae5' }}>LEARNED</span>}
                        {t.confidence != null && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)' }}>{Math.round(t.confidence * 100)}%</span>}
                        {ts && <span style={{ fontSize: 10.5, color: 'var(--faint)', marginLeft: 'auto' }}>{ts}</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>{t.message || (t.to ? `→ ${t.to}` : '')}</div>
                      {t.ruleId && <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', marginTop: 2 }}>{t.ruleId}{t.reversible ? ' · reversible' : ' · final'}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
