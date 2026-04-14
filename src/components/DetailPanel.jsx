import { useState } from 'react';

const BUCKET_ICONS = {
  STRAIGHT_THROUGH: '✓',
  AUTO_CORRECTED:   '↺',
  HUMAN_REVIEW:     '⚠',
  AUTO_REJECTED:    '✕',
};

function MetaRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <tr>
      <td style={{ color: 'var(--muted)', paddingRight: 16, paddingBottom: 6, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ color: 'var(--text)', paddingBottom: 6, wordBreak: 'break-word' }}>
        {String(value)}
      </td>
    </tr>
  );
}

function CheckRow({ check }) {
  const passColor = 'var(--green)';
  const failColor = check.fatal ? 'var(--red)' : 'var(--amber)';
  const color = check.passed ? passColor : failColor;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color, fontSize: 14, minWidth: 16, marginTop: 1 }}>
        {check.passed ? '✓' : (check.fatal ? '✕' : '⚠')}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 500 }}>{check.label}</span>
          {!check.passed && (
            <span style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 2,
              background: (check.fatal ? 'var(--red)' : 'var(--amber)') + '22',
              color: check.fatal ? 'var(--red)' : 'var(--amber)',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}>
              {check.fatal ? 'FATAL' : 'SOFT'}
            </span>
          )}
        </div>
        <div style={{ color: check.passed ? 'var(--muted)' : color, fontSize: 11 }}>
          {check.detail}
        </div>
      </div>
    </div>
  );
}

export default function DetailPanel({ result }) {
  const [rawExpanded, setRawExpanded] = useState(false);

  if (!result) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Select an invoice to inspect
      </div>
    );
  }

  const { bucket, bucketLabel, bucketColor, reason, checks, corrections, invoice, rawInvoice } = result;
  const isLive = rawInvoice?.confidence !== undefined;

  const confColor = rawInvoice?.confidence >= 0.8
    ? 'var(--green)'
    : rawInvoice?.confidence >= 0.5
    ? 'var(--amber)'
    : 'var(--red)';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 40px 0' }}>
      {/* Status Banner */}
      <div style={{
        background: bucketColor + '18',
        borderBottom: `2px solid ${bucketColor}`,
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}>
        <span style={{ fontSize: 26, color: bucketColor, lineHeight: 1, marginTop: 2 }}>
          {BUCKET_ICONS[bucket]}
        </span>
        <div>
          <div style={{ color: bucketColor, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
            {bucketLabel.toUpperCase()}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.6 }}>
            {reason}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Corrections callout */}
        {corrections.length > 0 && (
          <div style={{
            background: 'var(--green)11',
            border: '1px solid var(--green)44',
            borderRadius: 6,
            padding: '12px 16px',
          }}>
            <div style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
              AUTO-CORRECTIONS APPLIED
            </div>
            {corrections.map((c, i) => (
              <div key={i} style={{ color: 'var(--green)', fontSize: 12, marginBottom: 4 }}>
                ↺ {c}
              </div>
            ))}
          </div>
        )}

        {/* AI Extraction section (live uploads only) */}
        {isLive && (
          <div style={{
            border: '1px solid var(--accent)44',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'var(--accent)11',
              borderBottom: '1px solid var(--accent)33',
              padding: '10px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>
                AI EXTRACTION
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                Confidence: {Math.round(rawInvoice.confidence * 100)}%
              </span>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {/* Confidence bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>Extraction confidence</span>
                  <span style={{ color: confColor, fontSize: 11, fontWeight: 600 }}>
                    {Math.round(rawInvoice.confidence * 100)}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%',
                    width: `${rawInvoice.confidence * 100}%`,
                    background: confColor,
                    borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Warnings */}
              {rawInvoice.warnings?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 6 }}>Extraction warnings</div>
                  {rawInvoice.warnings.map((w, i) => (
                    <div key={i} style={{ color: 'var(--amber)', fontSize: 11, marginBottom: 4 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Raw text collapsible */}
              <button
                onClick={() => setRawExpanded(e => !e)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border2)',
                  borderRadius: 4,
                  color: 'var(--muted)',
                  fontSize: 11,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  marginBottom: rawExpanded ? 10 : 0,
                }}
              >
                {rawExpanded ? '▾' : '▸'} Raw extracted text
              </button>
              {rawExpanded && (
                <pre style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: 12,
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                }}>
                  {rawInvoice.rawText}
                </pre>
              )}

              {/* Dev note */}
              <div style={{
                marginTop: 14,
                padding: '8px 10px',
                background: 'var(--surface)',
                border: '1px dashed var(--border2)',
                borderRadius: 4,
                color: 'var(--muted)',
                fontSize: 10,
                letterSpacing: '0.03em',
              }}>
                In production: output from Claude Vision API · claude-opus-4-5 · /v1/messages
              </div>
            </div>
          </div>
        )}

        {/* Invoice metadata */}
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 12 }}>
            INVOICE METADATA
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <tbody>
              <MetaRow label="Invoice #"    value={invoice?.invoiceNumber} />
              <MetaRow label="Vendor"       value={invoice?.vendorName} />
              <MetaRow label="PO Number"    value={invoice?.poNumber} />
              <MetaRow label="Date"         value={invoice?.date} />
              <MetaRow label="Subtotal"     value={invoice?.subtotal != null ? `₹${invoice.subtotal.toLocaleString()}` : null} />
              <MetaRow label="Tax"          value={invoice?.tax != null ? `₹${invoice.tax.toLocaleString()}` : null} />
              <MetaRow label="Total"        value={invoice?.total != null ? `₹${invoice.total.toLocaleString()}` : null} />
              <MetaRow label="Goods Receipt" value={invoice?.goodsReceipt === true ? 'Confirmed' : invoice?.goodsReceipt === false ? 'Pending' : null} />
              <MetaRow label="Duplicate"    value={invoice?.duplicate === true ? 'Yes — flagged' : 'No'} />
            </tbody>
          </table>
        </div>

        {/* Line items */}
        {invoice?.lineItems?.length > 0 && (
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 12 }}>
              LINE ITEMS
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 6, paddingRight: 12, fontWeight: 500 }}>Description</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6, paddingRight: 12, fontWeight: 500 }}>Qty</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6, paddingRight: 12, fontWeight: 500 }}>Unit</th>
                  <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 500 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-dim)' }}>{item.desc}</td>
                    <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-dim)', textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-dim)', textAlign: 'right' }}>₹{item.unit}</td>
                    <td style={{ padding: '6px 0', color: 'var(--text)', textAlign: 'right' }}>₹{item.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Validation checks */}
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
            VALIDATION CHECKS
          </div>
          {checks.map(check => <CheckRow key={check.id} check={check} />)}
        </div>

      </div>
    </div>
  );
}
