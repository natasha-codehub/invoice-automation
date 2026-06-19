import { GL_CODES } from '../data/erpCatalog.js';

/**
 * MappingPanel — the Stage ③ "Validate & Map" surface (Builder's Manual C5).
 *
 * The differentiator made visible: each free-text invoice line resolved to a
 * canonical ERP material with a match type + confidence, the three-way match
 * (PO ↔ goods receipt ↔ invoice), GL/tax enrichment, and the existing validation
 * checks — all auditable. Reads pinv.mapping / pinv.threeWay / pinv.routed.
 */

const MATCH_META = {
  exact:     { label: 'EXACT',     color: '#059669', bg: '#dcfce7' },
  alias:     { label: 'ALIAS',     color: '#4f46e5', bg: '#e0e7ff' },
  fuzzy:     { label: 'FUZZY',     color: '#d97706', bg: '#fef9c3' },
  unmatched: { label: 'UNMATCHED', color: '#dc2626', bg: '#fee2e2' },
};

const TW_META = {
  matched:     { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', icon: '✓' },
  partial:     { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: '⚠' },
  over_billed: { color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', icon: '✕' },
  no_gr:       { color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', icon: '·' },
};

const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

function confColor(c) {
  if (c == null) return '#94a3b8';
  return c >= 0.8 ? '#059669' : c >= 0.6 ? '#d97706' : '#dc2626';
}

function SectionTitle({ children }) {
  return (
    <div style={{ color: '#1e293b', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
      {children}
    </div>
  );
}

export default function MappingPanel({ pinv }) {
  const mapping = pinv.mapping;
  const threeWay = pinv.threeWay;
  const checks = pinv.routed?.checks || [];

  if (!mapping) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, padding: 24, textAlign: 'center' }}>
        No mapping for this invoice — Stage ③ runs on the 12 real invoices (samples + /input) and anything you ingest.
      </div>
    );
  }

  const tw = TW_META[threeWay?.status] || TW_META.no_gr;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 48px', background: '#fff' }}>

      {/* Three-way match */}
      {threeWay && (
        <div style={{ marginBottom: 26 }}>
          <SectionTitle>Three-Way Match · PO ↔ Goods Receipt ↔ Invoice</SectionTitle>
          <div style={{ background: tw.bg, border: `1.5px solid ${tw.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: threeWay.lines.length ? 12 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: tw.color, fontSize: 18, fontWeight: 700 }}>{tw.icon}</span>
              <span style={{ color: tw.color, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>{threeWay.label.toUpperCase()}</span>
              {threeWay.po && <span style={{ color: '#64748b', fontSize: 12 }}>PO {threeWay.po}</span>}
            </div>
            <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>{threeWay.detail}</div>
          </div>
          {threeWay.lines.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#475569', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Item</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Ordered</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Received</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Invoiced</th>
                </tr>
              </thead>
              <tbody>
                {threeWay.lines.map((l, i) => {
                  const bad = l.issue;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: bad ? '#fffbeb' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', color: '#334155' }}>{l.desc}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#334155' }}>{l.ordered}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: bad === 'short_receipt' ? 800 : 400, color: bad === 'short_receipt' ? '#d97706' : '#334155' }}>{l.received}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: bad === 'over_billed' ? 800 : 400, color: bad === 'over_billed' ? '#dc2626' : '#334155' }}>{l.invoiced ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ERP line mapping */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>
          ERP Line Mapping
          <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            {mapping.matchedCount}/{mapping.lines.length} mapped
            {mapping.unmatchedCount > 0 && <span style={{ color: '#dc2626' }}> · {mapping.unmatchedCount} unmatched → HITL</span>}
          </span>
        </SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#475569', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Invoice line (raw)</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>→ Material</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700 }}>Match</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>Conf</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700 }}>GL</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700 }}>UoM</th>
            </tr>
          </thead>
          <tbody>
            {mapping.lines.map((l, i) => {
              const m = MATCH_META[l.matchType];
              const unmatched = l.matchType === 'unmatched';
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: unmatched ? '#fff1f2' : 'transparent' }}>
                  <td style={{ padding: '7px 8px', color: '#334155' }}>
                    {l.rawDesc}
                    {l.vendorPartNo && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>[{l.vendorPartNo}]</span>}
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    {l.matchedMaterialId ? (
                      <span><b style={{ color: '#3730a3' }}>{l.matchedMaterialId}</b> <span style={{ color: '#64748b' }}>{l.materialName}</span></span>
                    ) : (
                      <span style={{ color: '#dc2626' }}>
                        — no match{l.suggestedFix && <span style={{ color: '#b45309' }}> · suggest <b>{l.suggestedFix}</b></span>}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 4, color: m.color, background: m.bg }}>{m.label}</span>
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: confColor(l.confidence) }}>{Math.round(l.confidence * 100)}%</td>
                  <td style={{ padding: '7px 8px', textAlign: 'center', color: '#475569' }}>{l.glCode || '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'center', color: '#475569' }}>{l.uom || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Enrichment */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>Enrichment</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, fontSize: 13 }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>GL ACCOUNTS</div>
            {mapping.enrichment.glCodes.length ? mapping.enrichment.glCodes.map((g) => (
              <div key={g} style={{ color: '#334155' }}><b>{g}</b> {GL_CODES[g] || ''}</div>
            )) : <span style={{ color: '#94a3b8' }}>—</span>}
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>TAX CLASS</div>
            <div style={{ color: '#334155', textTransform: 'capitalize' }}>{mapping.enrichment.taxClass || '—'}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>COST CENTER</div>
            <div style={{ color: '#334155' }}>{mapping.enrichment.costCenter || '—'}</div>
          </div>
        </div>
      </div>

      {/* Validation checks */}
      {checks.length > 0 && (
        <div>
          <SectionTitle>Validation Checks</SectionTitle>
          {checks.map((c) => {
            const failColor = c.fatal ? '#dc2626' : '#d97706';
            const color = c.passed ? '#059669' : failColor;
            return (
              <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 4, marginBottom: 2, background: c.passed ? 'transparent' : (c.fatal ? '#fff1f2' : '#fffbeb') }}>
                <span style={{ color, fontWeight: 700, fontSize: 15, minWidth: 16 }}>{c.passed ? '✓' : (c.fatal ? '✕' : '⚠')}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: c.passed ? '#64748b' : color, lineHeight: 1.5 }}>{c.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
