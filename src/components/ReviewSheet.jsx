import { useState, useEffect, useRef } from 'react';
import { docTypeMeta } from '../pipeline/docTypes.js';
import InvoiceStepper from './InvoiceStepper.jsx';
import ExtractionInspector from './ExtractionInspector.jsx';
import MappingPanel from './MappingPanel.jsx';
import DetailPanel from './DetailPanel.jsx';
import ProvenanceDrawer from './ProvenanceDrawer.jsx';

/**
 * ReviewSheet — the per-invoice review page as a full-height slide-over
 * (UI redesign, mirroring the Rosetta child page in our indigo identity).
 *
 * Chrome is new (indigo action bar with the decision actions always top-right,
 * a footer, and a reject-with-reason modal); the *content* reuses the existing,
 * working surfaces — the stage stepper plus the Extract / Validate&Map / Route
 * panels — so none of the extraction/mapping logic is touched.
 */

export default function ReviewSheet({
  pinv, activeStage, onStageClick, busy,
  onEditField, onReextract, onAccept, onResolveLine, onApprove, onReject, onClose,
}) {
  const open = !!pinv;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  // Time-per-exception (E1): clock starts when this invoice opens, freezes at the
  // terminal action. Reported to the decisions store so the eval can chart it.
  const openedAtRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - openedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [open, pinv?.id]);
  const secs = () => (openedAtRef.current ? Math.round((Date.now() - openedAtRef.current) / 1000) : null);
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  const approve = () => onApprove?.(pinv, secs());

  // Esc closes the trace, then the modal, then the sheet.
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (traceOpen) setTraceOpen(false);
      else if (rejectOpen) setRejectOpen(false);
      else if (open) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, rejectOpen, traceOpen, onClose]);

  // Keyboard-first review (E1): A approve · R reject · P provenance. Ignored while
  // typing or when a modal/drawer owns the keyboard.
  useEffect(() => {
    const h = (e) => {
      if (!open || rejectOpen || traceOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); approve(); }
      else if (k === 'r') { e.preventDefault(); setRejectOpen(true); }
      else if (k === 'p') { e.preventDefault(); setTraceOpen(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, rejectOpen, traceOpen, pinv]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the reject form / trace whenever the sheet target changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRejectOpen(false); setReason(''); setTraceOpen(false); }, [pinv?.id]);

  const invNo = pinv?.extraction?.invoiceNumber || pinv?.id;
  const docLabel = pinv ? docTypeMeta(pinv).label : 'Document';
  const engine = pinv?.extraction?.extractionEngine;

  const confirmReject = () => {
    if (!reason.trim()) return;
    setRejectOpen(false);
    onReject?.(pinv, reason.trim(), secs());
    onClose();
  };

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{
        position: 'fixed', inset: 0, background: 'rgba(20,24,45,0.42)', zIndex: 40,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.25s ease',
      }} />

      <aside role="dialog" aria-modal="true" aria-label="Invoice review" style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: '92%', maxWidth: 1180,
        background: 'var(--surface)', boxShadow: '-12px 0 40px rgba(20,24,45,0.18)', zIndex: 50,
        display: 'flex', flexDirection: 'column', pointerEvents: open ? 'auto' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.26s cubic-bezier(.4,0,.2,1)',
      }}>
        {pinv && (
          <>
            {/* Indigo action bar */}
            <div style={{ background: 'var(--accent)', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', gap: 12 }}>
              <div style={{ color: '#fff', fontFamily: 'var(--mono)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>📄</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinv.vendorName} · {docLabel} {invNo}</span>
                {engine && <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.62)', flexShrink: 0 }}>· {engine}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span title="Time in review (time-per-exception)" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>⏱ {mmss}</span>
                <button className="rs-ghost-w" onClick={() => setTraceOpen(true)} title="Provenance trace (P)">🧾 Trace</button>
                {pinv.extraction && <button className="rs-ghost-w" onClick={onReextract} disabled={busy}>↻ Re-run</button>}
                <button className="rs-ghost-w" onClick={() => setRejectOpen(true)} title="Reject (R)">Reject</button>
                <button className="rs-approve" onClick={approve} title="Approve (A)">↗ Approve &amp; Post to ERP</button>
                <button className="rs-x" onClick={onClose} aria-label="Close review">×</button>
              </div>
            </div>

            {/* Body: stepper + the active stage panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <InvoiceStepper pinv={pinv} activeStage={activeStage} onStageClick={onStageClick} />
              {activeStage === 'extract' && pinv.extraction ? (
                <ExtractionInspector pinv={pinv} busy={busy} onEditField={onEditField} onReextract={onReextract} onAccept={onAccept} />
              ) : activeStage === 'validate' && pinv.mapping ? (
                <MappingPanel pinv={pinv} onResolveLine={onResolveLine} />
              ) : pinv.routed ? (
                <DetailPanel result={pinv.routed} />
              ) : pinv.isSynthetic ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                  Synthetic batch invoice — full extraction &amp; validation detail is available for the real invoices (samples + /input) and anything you ingest.
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                  No detailed panel at this stage for this document — see the stage summary above. (Reference documents like purchase orders and credit notes don’t run the invoice three-way-match / posting flow.)
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', flexShrink: 0, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button className="rs-ghost" onClick={() => setTraceOpen(true)}>🧾 Provenance trace</button>
                {pinv.extraction && <button className="rs-ghost" onClick={onReextract} disabled={busy}>↻ Re-run extraction</button>}
                <button className="rs-ghost" onClick={onClose}>⇄ Back to queue</button>
              </div>
              <button className="rs-approve-lg" onClick={approve}>↗ Approve &amp; Post to ERP</button>
            </div>
          </>
        )}
      </aside>

      {/* Reject modal */}
      {rejectOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setRejectOpen(false); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(20,24,45,0.5)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div role="alertdialog" aria-modal="true" aria-label="Reject invoice" style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, maxWidth: '92vw' }}>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Reject this invoice</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              It moves to the Rejected queue. Add a reason — it’s logged with the record and trains the matcher so the next one like it routes itself.
            </p>
            <textarea
              autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate of HS 16773 · wrong vendor mapping · line items don’t reconcile"
              aria-label="Rejection reason"
              style={{ width: '100%', border: '1px solid var(--border2)', borderRadius: 8, padding: 10, fontSize: 13, minHeight: 84, resize: 'vertical', color: 'var(--text)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 16 }}>
              <button className="rs-cancel" onClick={() => setRejectOpen(false)}>Cancel</button>
              <button className="rs-reject" onClick={confirmReject} disabled={!reason.trim()}>Confirm rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* Provenance trace drawer (E4) */}
      <ProvenanceDrawer pinv={pinv} open={traceOpen} onClose={() => setTraceOpen(false)} />

      <style>{`
        .rs-ghost-w { border:1px solid rgba(255,255,255,0.4); border-radius:6px; background:rgba(255,255,255,0.12); color:#fff; padding:6px 12px; font-size:12px; }
        .rs-ghost-w:hover:not(:disabled) { background:rgba(255,255,255,0.22); }
        .rs-ghost-w:disabled { opacity:0.5; cursor:not-allowed; }
        .rs-approve { background:var(--green); border:none; border-radius:6px; color:#fff; font-weight:600; padding:7px 14px; font-size:12.5px; }
        .rs-approve:hover { background:#0c8a5e; }
        .rs-x { background:none; border:none; color:#fff; font-size:22px; line-height:1; padding:2px 7px; }
        .rs-ghost { border:1px solid var(--border2); border-radius:7px; background:#fff; color:var(--muted); padding:7px 12px; font-size:12.5px; }
        .rs-ghost:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); background:#f6f7ff; }
        .rs-ghost:disabled { opacity:0.5; cursor:not-allowed; }
        .rs-approve-lg { background:var(--green); border:none; border-radius:7px; color:#fff; font-weight:600; padding:8px 16px; font-size:13px; }
        .rs-approve-lg:hover { background:#0c8a5e; }
        .rs-cancel { border:1px solid var(--border2); border-radius:7px; background:#fff; padding:7px 15px; font-size:13px; color:var(--muted); }
        .rs-reject { border:none; border-radius:7px; background:var(--red); padding:7px 15px; font-size:13px; font-weight:600; color:#fff; }
        .rs-reject:disabled { opacity:0.5; cursor:not-allowed; }
      `}</style>
    </>
  );
}
