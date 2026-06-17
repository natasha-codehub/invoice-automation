import { useState, useRef, useMemo, useEffect } from 'react';
import { STATUS_META, STAGE_LABELS } from '../pipeline/model.js';

const ROW_H = 58;
const OVERSCAN = 6;

const SORTS = {
  risk:   { label: '$ at risk', fn: (a, b) => b.valueAtRisk - a.valueAtRisk },
  conf:   { label: 'Confidence', fn: (a, b) => (a.confidence ?? 1) - (b.confidence ?? 1) },
  vendor: { label: 'Vendor', fn: (a, b) => a.vendorName.localeCompare(b.vendorName) },
};

function StatusChip({ status }) {
  const m = STATUS_META[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.03em',
      padding: '2px 7px', borderRadius: 4, background: m.bg, color: m.color, whiteSpace: 'nowrap',
    }}>
      {m.icon} {m.label.toUpperCase()}
    </span>
  );
}

export default function Worklist({ invoices, totalCount, selectedId, onSelect, filter, onClearFilter }) {
  const [sortKey, setSortKey] = useState('risk');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(520);
  const viewRef = useRef(null);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const update = () => setViewH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(() => [...invoices].sort(SORTS[sortKey].fn), [invoices, sortKey]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(sorted.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const visible = sorted.slice(start, end);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '2px solid var(--border)', minWidth: 360, width: 420 }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: '#f8fafc', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Worklist</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {sorted.length.toLocaleString()}{totalCount ? ` of ${totalCount.toLocaleString()}` : ''}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>sort</span>
          {Object.entries(SORTS).map(([k, s]) => (
            <button key={k} onClick={() => setSortKey(k)} className={`wl-sort${sortKey === k ? ' wl-sort-active' : ''}`}>
              {s.label}
            </button>
          ))}
        </div>
        {filter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>
              {STAGE_LABELS[filter.stage]} · {STATUS_META[filter.status].label}
            </span>
            <button onClick={onClearFilter} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              clear ✕
            </button>
          </div>
        )}
      </div>

      {/* Virtualized rows */}
      <div ref={viewRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ height: sorted.length * ROW_H, position: 'relative' }}>
          {visible.map((inv, i) => {
            const idx = start + i;
            const isSel = inv.id === selectedId;
            return (
              <button
                key={inv.id}
                onClick={() => onSelect(inv.id)}
                style={{
                  position: 'absolute', top: idx * ROW_H, left: 0, right: 0, height: ROW_H,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
                  padding: '0 14px', textAlign: 'left',
                  background: isSel ? '#ede9fe' : 'transparent',
                  borderLeft: `3px solid ${isSel ? '#7c3aed' : 'transparent'}`,
                  borderBottom: '1px solid #eef2f7', borderTop: 'none', borderRight: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inv.vendorName}
                  </span>
                  <StatusChip status={inv.overallStatus} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {inv.id} · stopped at {STAGE_LABELS[inv.stoppedAt]}
                  </span>
                  <span style={{ fontSize: 12, color: inv.valueAtRisk > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                    {inv.total != null ? `₹${inv.total.toLocaleString()}` : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .wl-sort { font-size: 11px; padding: 3px 8px; border: 1px solid #e2e8f0; border-radius: 5px;
          background: #fff; color: #64748b; cursor: pointer; font-family: 'IBM Plex Mono', monospace; }
        .wl-sort:hover { border-color: #a5b4fc; color: #4f46e5; }
        .wl-sort-active { background: #4f46e5; border-color: #4f46e5; color: #fff; font-weight: 700; }
      `}</style>
    </div>
  );
}
