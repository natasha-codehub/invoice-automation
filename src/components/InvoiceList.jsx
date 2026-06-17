export default function InvoiceList({ results, selectedIdx, onSelect }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {results.map((r, i) => {
        const isSelected = i === selectedIdx;
        return (
          <button
            key={r.invoiceId}
            onClick={() => onSelect(i)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '14px 16px',
              background: isSelected ? '#ede9fe' : 'transparent',
              border: 'none',
              borderLeft: `4px solid ${isSelected ? '#7c3aed' : 'transparent'}`,
              borderBottom: '1px solid #ddd6fe',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
              <span style={{ color: '#5b21b6', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                {r.invoiceId}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: r.bucketColor + '25',
                color: r.bucketColor,
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}>
                {r.bucketLabel.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 14, color: '#1e293b', marginBottom: 3, fontWeight: 600 }}>
              {r.invoice?.vendorName || r.normalisedVendor || '—'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 5 }}>
              {r.scenario}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {r.invoice?.total != null ? (
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                  ₹{r.invoice.total.toLocaleString()}
                </span>
              ) : <span />}
              {r.rawInvoice?.extractionEngine && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: 4,
                  letterSpacing: '0.02em',
                  background: r.rawInvoice.extractionEngineId === 'native' ? '#dcfce7' : '#e0e7ff',
                  color: r.rawInvoice.extractionEngineId === 'native' ? '#059669' : '#4f46e5',
                  whiteSpace: 'nowrap',
                }}>
                  ⛁ {r.rawInvoice.extractionEngine}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
