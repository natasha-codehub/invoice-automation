import { useState } from 'react';

const FIELDS = [
  { key: 'vendorRaw',     label: 'Vendor',     conf: 'vendor',        type: 'text' },
  { key: 'invoiceNumber', label: 'Invoice #',  conf: 'invoiceNumber', type: 'text' },
  { key: 'poNumber',      label: 'PO Number',  conf: 'poNumber',      type: 'text' },
  { key: 'date',          label: 'Date',       conf: 'date',          type: 'text' },
  { key: 'subtotal',      label: 'Subtotal',   conf: 'subtotal',      type: 'number' },
  { key: 'tax',           label: 'Tax',        conf: null,            type: 'number' },
  { key: 'total',         label: 'Total',      conf: 'total',         type: 'number' },
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
      {/* Left — source document */}
      <div style={{ width: '46%', minWidth: 340, borderRight: '1px solid var(--border)', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>
          SOURCE DOCUMENT {pinv.sourceFile ? `· ${pinv.sourceFile}` : ''}
        </div>
        {pinv.sourceUrl ? (
          <iframe title="source invoice" src={pinv.sourceUrl} style={{ flex: 1, border: 'none', background: '#fff' }} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>
            No source document for this invoice (synthetic / sample). Side-by-side PDF is available for the bundled /input invoices.
          </div>
        )}
      </div>

      {/* Right — extracted fields + confidence + consistency */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
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

        {/* Field rows (editable) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
          <tbody>
            {FIELDS.map((f) => {
              const c = f.conf ? fc[f.conf] : null;
              const low = c != null && c < 0.6;
              return (
                <tr key={f.key}>
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
