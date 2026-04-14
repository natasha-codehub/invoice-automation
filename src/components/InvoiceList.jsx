export default function InvoiceList({ results, selectedIdx, onSelect }) {
  return (
    <div style={{
      width: 290,
      minWidth: 290,
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      background: 'var(--bg)',
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
              padding: '12px 14px',
              background: isSelected ? 'var(--surface2)' : 'transparent',
              border: 'none',
              borderLeft: `3px solid ${isSelected ? r.bucketColor : 'transparent'}`,
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.05em' }}>
                {r.invoiceId}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 3,
                background: r.bucketColor + '22',
                color: r.bucketColor,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                {r.bucketLabel.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 3, fontWeight: 500 }}>
              {r.invoice?.vendorName || r.normalisedVendor || '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              {r.scenario}
            </div>
            {r.invoice?.total != null && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                ₹{r.invoice.total.toLocaleString()}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
