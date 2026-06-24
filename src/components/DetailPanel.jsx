import { useState } from 'react';
import { money } from '../utils/currency.js';

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
      <td style={{ color: '#64748b', paddingRight: 20, paddingBottom: 8, whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 13, fontWeight: 600 }}>
        {label}
      </td>
      <td style={{ color: '#1e293b', paddingBottom: 8, wordBreak: 'break-word', fontSize: 14 }}>
        {String(value)}
      </td>
    </tr>
  );
}

// Renders raw OCR text as clean, borderless rows/columns instead of a ragged
// monospace blob. Each line is split on 2+ space gaps into cells; numeric cells
// are right-aligned. Table borders stay at size 0 by design.
function RawTextTable({ text }) {
  const lines = (text || '').split('\n');
  const isNum = (s) => /^[($₹]?-?[\d,]+(\.\d+)?[%)]?$/.test(s.trim());
  return (
    <table style={{ borderCollapse: 'collapse', border: 0, width: '100%', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
      <tbody>
        {lines.map((line, i) => {
          const cells = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
          if (cells.length === 0) {
            return <tr key={i}><td style={{ border: 0, height: 8 }} /></tr>;
          }
          return (
            <tr key={i} style={{ background: i % 2 ? '#f1f5f9' : 'transparent' }}>
              {cells.map((c, j) => (
                <td key={j} style={{
                  border: 0,
                  padding: '3px 14px 3px 8px',
                  color: '#334155',
                  textAlign: isNum(c) ? 'right' : 'left',
                  whiteSpace: 'nowrap',
                }}>
                  {c}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CheckRow({ check }) {
  const passColor = '#059669';
  const failColor = check.fatal ? '#dc2626' : '#d97706';
  const color = check.passed ? passColor : failColor;
  const rowBg = check.passed ? 'transparent' : (check.fatal ? '#fff1f2' : '#fffbeb');
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
      background: rowBg,
      borderRadius: 4,
      marginBottom: 2,
    }}>
      <span style={{ color, fontSize: 16, minWidth: 18, marginTop: 1, fontWeight: 700 }}>
        {check.passed ? '✓' : (check.fatal ? '✕' : '⚠')}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: '#1e293b', fontSize: 14, fontWeight: 700 }}>{check.label}</span>
          {!check.passed && (
            <span style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              background: check.fatal ? '#fee2e2' : '#fef9c3',
              color: check.fatal ? '#dc2626' : '#d97706',
              letterSpacing: '0.05em',
              fontWeight: 800,
            }}>
              {check.fatal ? 'FATAL' : 'SOFT'}
            </span>
          )}
        </div>
        <div style={{ color: check.passed ? '#64748b' : color, fontSize: 13, lineHeight: 1.5 }}>
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
        Select an invoice to inspect
      </div>
    );
  }

  const { bucket, bucketLabel, bucketColor, reason, checks, corrections, invoice, rawInvoice } = result;
  const isLive = rawInvoice?.confidence !== undefined;

  const confColor = rawInvoice?.confidence >= 0.8 ? '#059669'
    : rawInvoice?.confidence >= 0.5 ? '#d97706'
    : '#dc2626';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 40px 0' }}>
      {/* Status Banner */}
      <div style={{
        background: bucketColor + '18',
        borderBottom: `3px solid ${bucketColor}`,
        padding: '20px 28px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}>
        <span style={{ fontSize: 30, color: bucketColor, lineHeight: 1, marginTop: 2, fontWeight: 700 }}>
          {BUCKET_ICONS[bucket]}
        </span>
        <div>
          <div style={{ color: bucketColor, fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', marginBottom: 5 }}>
            {bucketLabel.toUpperCase()}
          </div>
          <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.6 }}>
            {reason}
          </div>
        </div>
      </div>

      <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 26 }}>

        {/* Corrections callout */}
        {corrections.length > 0 && (
          <div style={{
            background: '#f0fdf4',
            border: '1.5px solid #6ee7b7',
            borderRadius: 8,
            padding: '14px 18px',
          }}>
            <div style={{ color: '#059669', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 8 }}>
              AUTO-CORRECTIONS APPLIED
            </div>
            {corrections.map((c, i) => (
              <div key={i} style={{ color: '#065f46', fontSize: 14, marginBottom: 5 }}>
                ↺ {c}
              </div>
            ))}
          </div>
        )}

        {/* AI Extraction section */}
        {isLive && (
          <div style={{
            border: '1.5px solid #a5b4fc',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <div style={{
              background: '#eef2ff',
              borderBottom: '1px solid #c7d2fe',
              padding: '12px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: '#3730a3', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>
                AI EXTRACTION
                {rawInvoice.extractionEngine && (
                  <span style={{
                    marginLeft: 8,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: rawInvoice.extractionEngineId === 'native' ? '#dcfce7' : '#e0e7ff',
                    color: rawInvoice.extractionEngineId === 'native' ? '#059669' : '#4f46e5',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}>
                    {rawInvoice.extractionEngine}
                    {rawInvoice.extractionMs != null ? ` · ${rawInvoice.extractionMs}ms` : ''}
                  </span>
                )}
              </span>
              <span style={{ color: '#4f46e5', fontSize: 13, fontWeight: 600 }}>
                Confidence: {Math.round(rawInvoice.confidence * 100)}%
              </span>
            </div>
            <div style={{ padding: '16px 18px', background: '#fafbff' }}>
              {/* Confidence bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>Extraction confidence</span>
                  <span style={{ color: confColor, fontSize: 13, fontWeight: 700 }}>
                    {Math.round(rawInvoice.confidence * 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                  <div style={{
                    height: '100%',
                    width: `${rawInvoice.confidence * 100}%`,
                    background: confColor,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Warnings */}
              {rawInvoice.warnings?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#475569', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Extraction warnings</div>
                  {rawInvoice.warnings.map((w, i) => (
                    <div key={i} style={{ color: '#d97706', fontSize: 13, marginBottom: 5, lineHeight: 1.5 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Raw text collapsible */}
              <button
                onClick={() => setRawExpanded(e => !e)}
                style={{
                  background: '#e0e7ff',
                  border: '1px solid #a5b4fc',
                  borderRadius: 5,
                  color: '#3730a3',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  marginBottom: rawExpanded ? 12 : 0,
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              >
                {rawExpanded ? '▾' : '▸'} Raw extracted text
              </button>
              {rawExpanded && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 5,
                  padding: '10px 6px',
                  overflowX: 'auto',
                }}>
                  <RawTextTable text={rawInvoice.rawText} />
                </div>
              )}

              {/* Dev note */}
              <div style={{
                marginTop: 16,
                padding: '8px 12px',
                background: '#f1f5f9',
                border: '1px dashed #cbd5e1',
                borderRadius: 5,
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 500,
              }}>
                {rawInvoice.extractionEngineId === 'native'
                  ? `Live output from Claude Vision · ${rawInvoice.extractionModel || 'claude-opus-4-8'} · /v1/messages`
                  : 'In production: output from Claude Vision API · claude-opus-4-8 · /v1/messages'}
              </div>
            </div>
          </div>
        )}

        {/* Invoice metadata */}
        <div>
          <div style={{ color: '#1e293b', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
            Invoice Metadata
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <MetaRow label="Invoice #"     value={invoice?.invoiceNumber} />
              <MetaRow label="Vendor"        value={invoice?.vendorName} />
              <MetaRow label="PO Number"     value={invoice?.poNumber} />
              <MetaRow label="Date"          value={invoice?.date} />
              <MetaRow label="Subtotal"      value={invoice?.subtotal != null ? money(invoice.subtotal) : null} />
              <MetaRow label="Tax"           value={invoice?.tax != null ? money(invoice.tax) : null} />
              <MetaRow label="Total"         value={invoice?.total != null ? money(invoice.total) : null} />
              <MetaRow label="Goods Receipt" value={invoice?.goodsReceipt === true ? 'Confirmed' : invoice?.goodsReceipt === false ? 'Pending' : null} />
              <MetaRow label="Duplicate"     value={invoice?.duplicate === true ? 'Yes — flagged' : 'No'} />
            </tbody>
          </table>
        </div>

        {/* Line items */}
        {invoice?.lineItems?.length > 0 && (
          <div>
            <div style={{ color: '#1e293b', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
              Line Items
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 8, paddingRight: 14, fontWeight: 700, color: '#475569', fontSize: 13 }}>Description</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 14, fontWeight: 700, color: '#475569', fontSize: 13 }}>Qty</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 14, fontWeight: 700, color: '#475569', fontSize: 13 }}>Unit</th>
                  <th style={{ textAlign: 'right', paddingBottom: 8, fontWeight: 700, color: '#475569', fontSize: 13 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px 8px 0', color: '#475569', fontSize: 14 }}>{item.desc}</td>
                    <td style={{ padding: '8px 14px 8px 0', color: '#475569', textAlign: 'right', fontSize: 14 }}>{item.qty}</td>
                    <td style={{ padding: '8px 14px 8px 0', color: '#475569', textAlign: 'right', fontSize: 14 }}>{money(item.unit)}</td>
                    <td style={{ padding: '8px 0', color: '#1e293b', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Validation checks */}
        <div>
          <div style={{ color: '#1e293b', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
            Validation Checks
          </div>
          {checks.map(check => <CheckRow key={check.id} check={check} />)}
        </div>

      </div>
    </div>
  );
}
