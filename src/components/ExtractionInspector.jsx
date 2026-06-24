import { useState, Fragment } from 'react';
import { money } from '../utils/currency.js';

const FIELDS = [
  { key: 'vendorRaw',     label: 'Vendor',     conf: 'vendor',        type: 'text',   section: 'Header' },
  { key: 'invoiceNumber', label: 'Invoice #',  conf: 'invoiceNumber', type: 'text',   section: 'Header' },
  { key: 'poNumber',      label: 'PO Number',  conf: 'poNumber',      type: 'text',   section: 'Header' },
  { key: 'date',          label: 'Date',       conf: 'date',          type: 'text',   section: 'Header' },
  { key: 'subtotal',      label: 'Subtotal',   conf: 'subtotal',      type: 'number', section: 'Totals' },
  { key: 'tax',           label: 'Tax',        conf: null,            type: 'number', section: 'Totals' },
  { key: 'total',         label: 'Total',      conf: 'total',         type: 'number', section: 'Totals' },
];

function confColor(c) {
  if (c == null) return '#94a3b8';
  return c >= 0.8 ? '#059669' : c >= 0.6 ? '#d97706' : '#dc2626';
}

function ConfChip({ c }) {
  if (c == null) return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: confColor(c), minWidth: 34, textAlign: 'right' }}>
      {Math.round(c * 100)}%
    </span>
  );
}

// Styled mock invoice page built from the extraction — shown when there's no
// real source PDF (synthetic / sample invoices), mirroring a rendered document.
function MockInvoicePage({ ext }) {
  const lines = ext.lineItems || [];
  return (
    <div style={{
      background: '#fff', width: '100%', maxWidth: 420, borderRadius: 3,
      padding: '26px 30px', boxShadow: '0 1px 6px rgba(0,0,0,0.25)', color: '#1a1a2e',
      fontFamily: 'IBM Plex Mono, monospace',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{ext.vendorRaw || 'Unknown Vendor'}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Reconstructed from extraction · no source file</div>
      <div style={{ borderTop: '2px solid #4f46e5', margin: '10px 0 12px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10, marginBottom: 14 }}>
        <span style={{ color: '#94a3b8' }}>Invoice No.</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{ext.invoiceNumber || '—'}</span>
        <span style={{ color: '#94a3b8' }}>Invoice Date</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{ext.date || '—'}</span>
        <span style={{ color: '#94a3b8' }}>PO Ref.</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{ext.poNumber || '—'}</span>
      </div>
      {lines.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '0.5px solid #e2e8f0', paddingBottom: 3, marginBottom: 6 }}>
            Line items
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
            <thead>
              <tr style={{ color: '#94a3b8' }}>
                <th style={{ textAlign: 'left', fontWeight: 500, padding: '3px 0' }}>Description</th>
                <th style={{ textAlign: 'right', fontWeight: 500, padding: '3px 0' }}>Qty</th>
                <th style={{ textAlign: 'right', fontWeight: 500, padding: '3px 0' }}>Unit</th>
                <th style={{ textAlign: 'right', fontWeight: 500, padding: '3px 0' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderTop: '0.5px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 0', color: '#334155' }}>{l.desc}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', color: '#334155' }}>{l.qty}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', color: '#334155' }}>{money(l.unit)}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', color: '#334155' }}>{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, marginTop: 12, fontSize: 10 }}>
        <div style={{ display: 'flex', gap: 14 }}><span style={{ color: '#94a3b8', minWidth: 70, textAlign: 'right' }}>Subtotal</span><span style={{ fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{money(ext.subtotal)}</span></div>
        {ext.tax != null && <div style={{ display: 'flex', gap: 14 }}><span style={{ color: '#94a3b8', minWidth: 70, textAlign: 'right' }}>Tax</span><span style={{ fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{money(ext.tax)}</span></div>}
        <div style={{ display: 'flex', gap: 14, borderTop: '1px solid #334155', paddingTop: 3, marginTop: 2 }}><span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right' }}>Amount Due</span><span style={{ fontWeight: 700, minWidth: 64, textAlign: 'right' }}>{money(ext.total)}</span></div>
      </div>
    </div>
  );
}

export default function ExtractionInspector({ pinv, busy, onEditField, onReextract, onAccept }) {
  const ext = pinv.extraction || {};
  // Re-sync the editable draft when the (re-piped) invoice changes — done during
  // render via a signature, not an effect (React's recommended pattern).
  const sig = `${pinv.id}|${ext.vendorRaw}|${ext.invoiceNumber}|${ext.poNumber}|${ext.date}|${ext.subtotal}|${ext.tax}|${ext.total}`;
  const [prevSig, setPrevSig] = useState(null);
  const [draft, setDraft] = useState({});
  if (sig !== prevSig) {
    setPrevSig(sig);
    const d = {};
    for (const f of FIELDS) d[f.key] = ext[f.key] ?? '';
    setDraft(d);
  }

  const fc = pinv.fieldConfidence || ext.fieldConfidence || {};
  const consistency = pinv.stages?.extract?.consistency;
  const extReview = pinv.stages?.extract?.status === 'needs_review';

  const commit = (key, raw, type) => {
    const value = type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
    if (value !== (ext[key] ?? '')) onEditField(key, value);
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left — source document, in a PDF-viewer chrome */}
      <div style={{ width: '46%', minWidth: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#475569' }}>
        {/* Dark viewer toolbar */}
        <div style={{ background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📄 {pinv.sourceFile || 'reconstructed-from-extraction'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, flexShrink: 0, marginLeft: 8 }}>Page 1 of 1</span>
        </div>
        {pinv.sourceUrl ? (
          <iframe title="source invoice" src={pinv.sourceUrl} style={{ flex: 1, border: 'none', background: '#fff' }} />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <MockInvoicePage ext={ext} />
          </div>
        )}
      </div>

      {/* Right — extracted fields + confidence + consistency */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', background: '#fff' }}>
        {/* Header / actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#3730a3', letterSpacing: '0.04em' }}>EXTRACTED FIELDS</span>
          {pinv.confidence != null && (
            <span style={{ fontSize: 12, color: confColor(pinv.confidence), fontWeight: 700 }}>
              overall {Math.round(pinv.confidence * 100)}%
            </span>
          )}
          {ext.extractionEngine && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#e0e7ff', color: '#4f46e5', fontWeight: 700 }}>
              {ext.extractionEngine}{ext.extractionMs != null ? ` · ${ext.extractionMs}ms` : ''}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {extReview && (
            <button onClick={onAccept} disabled={busy} className="ins-btn ins-accept">✓ Accept</button>
          )}
          <button onClick={onReextract} disabled={busy} className="ins-btn">↻ Re-extract</button>
        </div>

        {/* Field rows (editable), grouped Header / Totals */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
          <tbody>
            {FIELDS.map((f, i) => {
              const c = f.conf ? fc[f.conf] : null;
              const low = c != null && c < 0.6;
              const newSection = i === 0 || FIELDS[i - 1].section !== f.section;
              return (
                <Fragment key={f.key}>
                  {newSection && (
                    <tr>
                      <td colSpan={3} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#94a3b8', textTransform: 'uppercase', padding: i === 0 ? '0 0 6px' : '12px 0 6px' }}>
                        {f.section}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ fontSize: 13, color: '#64748b', fontWeight: 600, padding: '5px 12px 5px 0', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{f.label}</td>
                    <td style={{ padding: '5px 0', width: '100%' }}>
                      <input
                        value={draft[f.key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        onBlur={(e) => commit(f.key, e.target.value, f.type)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        style={{
                          width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 5,
                          border: `1px solid ${low ? '#fca5a5' : '#e2e8f0'}`,
                          background: low ? '#fff5f5' : '#fff', color: '#1e293b',
                          fontFamily: 'IBM Plex Mono, monospace',
                        }}
                      />
                    </td>
                    <td style={{ padding: '5px 0 5px 10px', verticalAlign: 'middle' }}><ConfChip c={c} /></td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Consistency gate */}
        {consistency && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', letterSpacing: '0.04em', marginBottom: 8 }}>
              CONSISTENCY GATE {consistency.ok ? <span style={{ color: '#059669' }}>· all checks pass</span> : <span style={{ color: '#dc2626' }}>· mismatch — routed to review</span>}
            </div>
            {consistency.checks.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, marginBottom: 3, color: c.passed ? '#64748b' : (c.severity === 'error' ? '#dc2626' : '#d97706') }}>
                <span style={{ fontWeight: 700, color: c.passed ? '#059669' : (c.severity === 'error' ? '#dc2626' : '#d97706') }}>{c.passed ? '✓' : (c.severity === 'error' ? '✕' : '⚠')}</span>
                <span><b>{c.label}</b> — {c.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* Extraction warnings */}
        {ext.warnings?.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', letterSpacing: '0.04em', marginBottom: 8 }}>EXTRACTION WARNINGS</div>
            {ext.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: '#d97706', lineHeight: 1.5, marginBottom: 4 }}>⚠ {w}</div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .ins-btn { font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 6px;
          border: 1.5px solid #c4b5fd; background: #ede9fe; color: #6d28d9; cursor: pointer;
          font-family: 'IBM Plex Mono', monospace; }
        .ins-btn:hover:not(:disabled) { background: #ddd6fe; }
        .ins-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ins-accept { border-color: #6ee7b7; background: #dcfce7; color: #059669; }
        .ins-accept:hover:not(:disabled) { background: #bbf7d0; }
      `}</style>
    </div>
  );
}
