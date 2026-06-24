import { useState, useRef, useMemo, useEffect } from 'react';
import { STATUS_META, STAGE_LABELS } from '../pipeline/model.js';
import { docTypeKey, docTypeMeta, DOC_TYPES } from '../pipeline/docTypes.js';

/**
 * Worklist — the Document Queue table (UI redesign).
 *
 * A calm, aligned table replaces the old free-form rows: Document (vendor ·
 * invoice + source subline + segment badge) · Type · Status pill · Confidence ·
 * Amount. Still hand-virtualized (ResizeObserver windowing) so it holds 1,000+
 * rows. Clicking a row opens the slide-over review sheet.
 */

const ROW_H = 60;
const OVERSCAN = 6;
const GRID = 'minmax(0,3.1fr) minmax(0,1.15fr) minmax(0,1.1fr) minmax(0,.7fr) minmax(0,.95fr)';

// Calm status pills keyed to the overall status grammar.
const PILL = {
  passed:        { label: 'Passed',        c: 'var(--green)', bg: 'var(--green-bg)', dot: '#10b981' },
  auto_resolved: { label: 'Auto-resolved', c: 'var(--cyan)',  bg: 'var(--cyan-bg)',  dot: '#06b6d4' },
  needs_review:  { label: 'Needs review',  c: 'var(--amber)', bg: 'var(--amber-bg)', dot: '#f59e0b' },
  failed:        { label: 'Failed',        c: 'var(--red)',   bg: 'var(--red-bg)',   dot: '#ef4444' },
  posted:        { label: 'Posted',        c: '#0d9488',      bg: '#ccfbf1',         dot: '#0d9488' },
  rejected:      { label: 'Rejected',      c: '#e11d48',      bg: '#ffe4e6',         dot: '#e11d48' },
  pending:       { label: 'In flight',     c: 'var(--muted)', bg: 'var(--surface2)', dot: '#94a3b8' },
};

function confColor(c) {
  if (c == null) return 'var(--faint)';
  return c >= 0.85 ? 'var(--green)' : c >= 0.6 ? 'var(--amber)' : 'var(--red)';
}

function StatusPill({ status }) {
  const m = PILL[status] || PILL.pending;
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 11,
      background: m.bg, color: m.c, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot }} />
      {m.label}
    </span>
  );
}

const SORTS = {
  risk:   { label: '$ at risk', fn: (a, b) => b.valueAtRisk - a.valueAtRisk },
  conf:   { label: 'Confidence', fn: (a, b) => (a.confidence ?? 1) - (b.confidence ?? 1) },
  vendor: { label: 'Vendor', fn: (a, b) => a.vendorName.localeCompare(b.vendorName) },
};

export default function Worklist({ invoices, totalCount, selectedId, onSelect, filter, onClearFilter }) {
  const [typeFilter, setTypeFilter] = useState('all');
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

  // Queue ordering floats the demoable cases up so they're one scroll away, not
  // buried in a thousand rows: real scanned PDFs first (tier 0 — clicking the top
  // row opens an actual document), then the rest of the real + ingested set
  // (tier 1), then the synthetic fill (tier 2). The chosen sort still orders rows
  // *within* each tier.
  // Document types actually present in the queue → the type-filter options (so we
  // never show a filter for a type that has no rows).
  const typesPresent = useMemo(() => {
    const seen = new Set();
    for (const inv of invoices) seen.add(docTypeKey(inv));
    return Object.keys(DOC_TYPES).filter(k => seen.has(k));
  }, [invoices]);

  const tier = (inv) => (inv.isSynthetic ? 2 : inv.sourceKind === 'native' ? 0 : 1);
  const sorted = useMemo(() => {
    const base = typeFilter === 'all' ? invoices : invoices.filter(inv => docTypeKey(inv) === typeFilter);
    return [...base].sort((a, b) => {
      const ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      return SORTS[sortKey].fn(a, b);
    });
  }, [invoices, sortKey, typeFilter]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(sorted.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const visible = sorted.slice(start, end);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar: count · active funnel filter · sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: '#fafbfd', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Showing <b style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{sorted.length.toLocaleString()}</b>
          {totalCount ? ` of ${totalCount.toLocaleString()}` : ''}
        </span>
        {filter && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontWeight: 600 }}>
              {STAGE_LABELS[filter.stage]} · {STATUS_META[filter.status].label}
            </span>
            <button onClick={onClearFilter} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none' }}>clear ✕</button>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>type</span>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="wl-type"
          aria-label="Filter by document type"
        >
          <option value="all">All types</option>
          {typesPresent.map(k => (
            <option key={k} value={k}>{DOC_TYPES[k].label}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>sort</span>
        {Object.entries(SORTS).map(([k, s]) => (
          <button key={k} onClick={() => setSortKey(k)} className={`wl-sort${sortKey === k ? ' wl-sort-active' : ''}`}>{s.label}</button>
        ))}
      </div>

      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '9px 16px',
        background: '#fafbfd', borderBottom: '1px solid var(--border)', flexShrink: 0,
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 600,
      }}>
        <span>Document</span><span>Type</span><span>Status</span><span>Conf</span><span style={{ textAlign: 'right' }}>Amount</span>
      </div>

      {/* Virtualized rows */}
      <div ref={viewRef} data-wl-scroller onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ height: sorted.length * ROW_H, position: 'relative' }}>
          {visible.map((inv, i) => {
            const idx = start + i;
            const isSel = inv.id === selectedId;
            const isLive = String(inv.id).startsWith('INV-LIVE-');
            const invNo = inv.extraction?.invoiceNumber;
            const prov = inv.provenance;
            const src = inv.scenario || inv.sourceFile || `stopped at ${STAGE_LABELS[inv.stoppedAt]}`;
            return (
              <button
                key={inv.id}
                onClick={() => onSelect(inv.id)}
                style={{
                  position: 'absolute', top: idx * ROW_H, left: 0, right: 0, height: ROW_H,
                  display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8,
                  padding: '0 16px', textAlign: 'left',
                  background: isSel ? 'var(--accent-soft)' : (isLive ? '#faf8ff' : 'transparent'),
                  borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  borderBottom: '1px solid #f1f2f7', borderTop: 'none', borderRight: 'none',
                }}
                className="wl-row"
              >
                {/* Document */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {isLive && (
                      <span title="Just ingested" style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 5, padding: '1px 5px' }}>NEW</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.vendorName}{invNo ? <span style={{ color: 'var(--text)', fontWeight: 400 }}> · {invNo}</span> : ''}
                    </span>
                    {prov?.kind === 'statement-segment' && (
                      <span style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 5, padding: '0 6px' }}>
                        {prov.segmentIndex} of {prov.segmentCount}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    src: {src}
                  </div>
                </div>

                {/* Type */}
                <span>
                  {(() => {
                    const dt = docTypeMeta(inv);
                    return (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10.5, padding: '2px 8px', borderRadius: 5, fontWeight: 500, whiteSpace: 'nowrap',
                        background: dt.bg, color: dt.fg,
                      }}>
                        {dt.label}
                      </span>
                    );
                  })()}
                </span>

                {/* Status */}
                <span><StatusPill status={inv.overallStatus} /></span>

                {/* Confidence */}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: confColor(inv.confidence) }}>
                  {inv.confidence != null ? `${Math.round(inv.confidence * 100)}%` : '—'}
                </span>

                {/* Amount */}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, textAlign: 'right', fontWeight: 600, color: inv.valueAtRisk > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                  {inv.total != null ? `₹${inv.total.toLocaleString()}` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .wl-row:hover { background: #f6f7ff !important; }
        .wl-sort { font-size: 11px; padding: 3px 9px; border: 1px solid var(--border2); border-radius: 6px;
          background: #fff; color: var(--muted); font-family: var(--mono); }
        .wl-sort:hover { border-color: var(--accent); color: var(--accent); }
        .wl-sort-active { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
        .wl-type { font-size: 11px; padding: 3px 8px; border: 1px solid var(--border2); border-radius: 6px;
          background: #fff; color: var(--muted); font-family: var(--mono); cursor: pointer; }
        .wl-type:hover { border-color: var(--accent); color: var(--accent); }
      `}</style>
    </div>
  );
}
