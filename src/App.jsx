import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DEMO_MATHESON } from './utils/mockExtractor.js';
import { runExtraction } from './utils/extraction/providers.js';
import { SHARPGAS_STATEMENT } from './data/statements.js';
import { segmentDocument } from './pipeline/segmentation.js';
import { bundledInvoices, sampleInvoicesWithSource, referenceDocs, generateSynthetic } from './pipeline/generateBatch.js';
import { runPipeline } from './pipeline/runPipeline.js';
import { TOUCHLESS, mkStage, STATUS } from './pipeline/model.js';
import { aggregateBatch } from './pipeline/aggregateBatch.js';
import { subscribe as subscribeLearning, learnAlias, logDecision, counts as learningCounts, reset as resetLearning, getState as getLearningState } from './data/correctionsStore.js';
import EvalDashboard from './components/EvalDashboard.jsx';
import KpiCards from './components/KpiCards.jsx';
import BatchFunnel from './components/BatchFunnel.jsx';
import Worklist from './components/Worklist.jsx';
import ReviewSheet from './components/ReviewSheet.jsx';

const TOLERANCES = [1, 2, 3, 5];
const BATCH_ID = 'B-2026-0617';
const SYNTH_COUNT = 983; // + 15 real (12 invoices + 3 statement segments) + 2 reference docs (PO, credit note) = a 1,000-doc batch

export default function App() {
  const [tolerance, setTolerance] = useState(2);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const engine = 'demo'; // single bundled engine; the Native (BYO-key) seam was removed from the UI
  const [extractError, setExtractError] = useState('');
  const progressTimerRef = useRef(null);
  const liveSeq = useRef(0);

  // ── Batch Pipeline: one intake batch, 3 zoom levels, now the only processing tab ──
  const [liveRaw, setLiveRaw] = useState([]);        // demo / drop / /input ingests (raw extractions)
  const [patched, setPatched] = useState({});        // id → re-piped PipelineInvoice (edits/re-runs)
  const [worklistFilter, setWorklistFilter] = useState(null);   // funnel segment → {stage,status}
  const [lifecycleFilter, setLifecycleFilter] = useState(null); // lifecycle tab → overallStatus
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false); // Add-documents popover
  const [evalOpen, setEvalOpen] = useState(false);       // Eval & STP slide-over
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [activeStage, setActiveStage] = useState(null);

  // The learning flywheel (Phase E): a version that bumps whenever the
  // corrections store changes, so the whole batch re-maps against newly-taught
  // aliases — resolve one unmatched line and every matching line auto-resolves.
  const [learnVersion, setLearnVersion] = useState(0);
  useEffect(() => subscribeLearning(() => setLearnVersion(v => v + 1)), []);
  const learning = useMemo(() => learningCounts(), [learnVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tolerance is a global re-run: drop per-invoice edits so they don't apply
  // against a stale pipe (they're cheap to redo).
  useEffect(() => { setPatched({}); }, [tolerance]);

  // The Sharpgas Q1 statement is just another inbound file: segmented into its
  // member invoices and seeded straight into the batch (no special "ingest"
  // button). They surface in the queue as Type = Statement, each traceable to
  // its source page — demonstrating "1 file ≠ 1 invoice" without a manual step.
  const statementSegments = useMemo(
    () => segmentDocument(SHARPGAS_STATEMENT).map((s) => ({
      ...s, id: `INV-${s.invoiceNumber}`, vendorName: s.vendorRaw,
      extractionEngine: 'Demo', extractionEngineId: 'demo',
    })),
    [],
  );

  // Real invoices (statement segments + 4 bundled ESPRIGAS + 8 samples) and the
  // synthetic fill are each built once; only the real + ingested set is re-piped
  // on tolerance change, so the funnel moves for reasons tolerance controls.
  const realRaw = useMemo(() => [...statementSegments, ...bundledInvoices(), ...sampleInvoicesWithSource()], [statementSegments]);
  const synthetic = useMemo(() => generateSynthetic(SYNTH_COUNT, BATCH_ID), []);
  // Reference documents (PO, credit note) — pre-baked like the synthetic fill (they
  // skip the invoice flow), but real & demoable so they sit in the top tier.
  const refDocs = useMemo(() => referenceDocs(BATCH_ID), []);
  const piped = useMemo(
    () => [...liveRaw, ...realRaw].map(inv => runPipeline(inv, tolerance, BATCH_ID)),
    // learnVersion is intentional: re-map the batch when an alias is taught
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveRaw, realRaw, tolerance, learnVersion],
  );

  const displayInvoices = useMemo(
    () => [...piped, ...refDocs, ...synthetic].map(inv => patched[inv.id] || inv),
    [piped, refDocs, synthetic, patched],
  );
  const batch = useMemo(() => aggregateBatch(displayInvoices, BATCH_ID), [displayInvoices]);

  // Two filter paths into the same queue: the lifecycle tabs (by overall status)
  // and the funnel segments (by stage × status). Only one is active at a time.
  const filteredBatch = useMemo(() => {
    if (worklistFilter) return displayInvoices.filter(inv => inv.stages[worklistFilter.stage]?.status === worklistFilter.status);
    if (lifecycleFilter) return displayInvoices.filter(inv => inv.overallStatus === lifecycleFilter);
    return displayInvoices;
  }, [displayInvoices, worklistFilter, lifecycleFilter]);

  // Counts for the lifecycle tabs.
  const lifecycleCounts = useMemo(() => {
    const c = { passed: 0, auto_resolved: 0, needs_review: 0, failed: 0, posted: 0, rejected: 0 };
    for (const inv of displayInvoices) if (c[inv.overallStatus] != null) c[inv.overallStatus] += 1;
    return c;
  }, [displayInvoices]);

  const selectedPinv = useMemo(
    () => displayInvoices.find(inv => inv.id === selectedPipelineId) || null,
    [displayInvoices, selectedPipelineId],
  );

  // Reviewer decisions (Approve/Reject log) for the Eval page — bumps with the
  // learning store, which logDecision also notifies.
  const decisions = useMemo(() => getLearningState().decisions, [learnVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flywheel impact (Phase F-lite): the counterfactual that makes the moat
  // *measurable*. Re-pipe the real + ingested invoices with learned aliases turned
  // OFF (the pre-flywheel baseline) and diff against the live `piped`: how many
  // mapping exceptions the learned aliases removed, the lines they auto-resolved,
  // and the touch-rate before vs now. Only the real/ingested set carries mappings,
  // so the synthetic fill is irrelevant here and we skip it.
  const flywheel = useMemo(() => {
    const empty = { aliases: 0, linesResolved: 0, vendors: 0, exceptionsRemoved: 0, rescued: 0, touchBasePct: null, touchNowPct: null, resolvedLines: [] };
    if (!learning.aliases) return empty;
    const base = [...liveRaw, ...realRaw].map(inv => runPipeline(inv, tolerance, BATCH_ID, { ignoreLearned: true }));
    const baseById = Object.fromEntries(base.map(b => [b.id, b]));
    const touchless = (s) => TOUCHLESS.has(s);
    const mappingExceptions = (pinv) =>
      (pinv.mapping?.lines || []).filter(l => l.matchType === 'unmatched').length
      + (pinv.mapping && pinv.mapping.minConfidence != null && pinv.mapping.minConfidence < 0.6 ? 1 : 0);

    let linesResolved = 0, exceptionsRemoved = 0, rescued = 0, touchBaseN = 0, touchNowN = 0;
    const resolvedLines = [];
    for (const now of piped) {
      const b = baseById[now.id];
      if (!b) continue;
      if (touchless(b.overallStatus)) touchBaseN += 1;
      if (touchless(now.overallStatus)) touchNowN += 1;
      if (!touchless(b.overallStatus) && touchless(now.overallStatus)) rescued += 1;
      exceptionsRemoved += Math.max(0, mappingExceptions(b) - mappingExceptions(now));
      for (const l of (now.mapping?.lines || [])) {
        if (l.learned) { linesResolved += 1; resolvedLines.push({ id: now.id, vendor: now.vendorName, raw: l.rawDesc, mat: l.matchedMaterialId, name: l.materialName }); }
      }
    }
    const denom = piped.length || 1;
    return {
      aliases: learning.aliases, linesResolved, exceptionsRemoved, rescued,
      vendors: new Set(resolvedLines.map(r => r.vendor)).size,
      touchBasePct: Math.round((touchBaseN / denom) * 100),
      touchNowPct: Math.round((touchNowN / denom) * 100),
      realCount: piped.length, resolvedLines,
    };
  }, [piped, liveRaw, realRaw, tolerance, learning.aliases]);

  // Re-pipe an invoice after a human edit / accept / re-extract, keeping human + engine traces.
  const repipeWith = useCallback((cur, ext, trace, accept = false) => {
    const carried = (cur.traces || []).filter(t => {
      const a = String(t.actor || '');
      return a.startsWith('human') || a.startsWith('engine');
    });
    const repiped = runPipeline(ext, tolerance, cur.batchId, { acceptExtract: accept, extraTraces: [...carried, trace] });
    setPatched(p => ({ ...p, [cur.id]: repiped }));
  }, [tolerance]);

  const onEditField = useCallback((field, value) => {
    const cur = selectedPinv;
    if (!cur?.extraction) return;
    const ext = { ...cur.extraction, [field]: value };
    if (field === 'vendorRaw') ext.vendorName = value;
    const confKey = field === 'vendorRaw' ? 'vendor' : field;
    ext.fieldConfidence = { ...(cur.extraction.fieldConfidence || {}), [confKey]: 1 }; // human-verified
    repipeWith(cur, ext, { field, actor: 'human:natasha', to: String(value), message: `Edited ${field} → ${value}`, reversible: true });
  }, [selectedPinv, repipeWith]);

  const onAcceptExtract = useCallback(() => {
    const cur = selectedPinv;
    if (!cur?.extraction) return;
    repipeWith(cur, { ...cur.extraction }, { field: 'extract', actor: 'human:natasha', message: 'Accepted extraction', reversible: false }, true);
  }, [selectedPinv, repipeWith]);

  const onReextract = useCallback(async () => {
    const cur = selectedPinv;
    if (!cur?.extraction) return;
    setExtractError('');
    try {
      const ex = await runExtraction(engine, null, { sourceName: cur.sourceFile, url: cur.sourceUrl });
      const ext = {
        ...cur.extraction, ...ex,
        id: cur.id, vendorName: ex.vendorRaw || cur.extraction.vendorName,
        sourceUrl: cur.sourceUrl, sourceFile: cur.sourceFile, scenario: cur.scenario,
      };
      repipeWith(cur, ext, { field: 'extract', actor: `engine:${ex.extractionEngineId}`, message: `Re-extracted with ${ex.extractionEngine}`, reversible: true });
    } catch (err) {
      setExtractError(err.message || 'Re-extraction failed');
    }
  }, [selectedPinv, engine, repipeWith]);

  // Open one invoice in the review sheet (default to its Extract inspector when
  // there's a source document, else the stage it stopped at).
  const selectInvoice = useCallback((id) => {
    const pinv = displayInvoices.find(i => i.id === id);
    setSelectedPipelineId(id);
    setActiveStage(pinv?.extraction ? 'extract' : (pinv?.stoppedAt || null));
  }, [displayInvoices]);

  const closeSheet = useCallback(() => { setSelectedPipelineId(null); setActiveStage(null); }, []);

  // Phase E flywheel: a reviewer resolves an unmatched (or wrong) line to a
  // canonical material. We (1) teach the vendor alias — keyed exactly as the
  // matcher looks it up: a vendor part#, else the upper-cased description — which
  // bumps learnVersion and re-maps the whole batch, and (2) re-pipe the current
  // invoice so its own line flips immediately, carrying the human trace.
  const onResolveLine = useCallback(({ line, materialId, reason }) => {
    const cur = selectedPinv;
    if (!cur?.extraction) return;
    const vendor = cur.routed?.normalisedVendor || cur.vendorName;
    const token = line.vendorPartNo || String(line.rawDesc || '').trim().toUpperCase();
    learnAlias({ vendor, token, materialId, fromDesc: line.rawDesc, invoiceId: cur.id, reason });
    repipeWith(cur, { ...cur.extraction }, {
      field: 'mapping', actor: 'human:natasha', to: materialId,
      message: `Resolved "${line.rawDesc}" → ${materialId}${reason ? ` — ${reason}` : ''}`, reversible: true,
    });
  }, [selectedPinv, repipeWith]);

  // Terminal actions — now logged to the decisions store (E2). secondsInReview is
  // the time-per-exception metric, measured by the sheet.
  const onApprove = useCallback((pinv, secondsInReview) => {
    if (!pinv) return;
    logDecision({ invoiceId: pinv.id, vendor: pinv.routed?.normalisedVendor || pinv.vendorName, decision: 'approve', secondsInReview });
    // Make the action land on screen: the doc leaves the review queue and posts.
    // It's human-resolved, so it does NOT count toward (zero-touch) STP. Resolve
    // the stage it stopped at too, so the Pipeline-view funnel stays consistent.
    const stage = pinv.stoppedAt && pinv.stoppedAt !== 'route' ? pinv.stoppedAt : null;
    setPatched(p => ({ ...p, [pinv.id]: {
      ...pinv,
      overallStatus: STATUS.POSTED,
      stoppedAt: 'route',
      valueAtRisk: 0,
      stages: {
        ...pinv.stages,
        ...(stage ? { [stage]: mkStage(STATUS.PASSED, pinv.stages[stage]?.confidence ?? null, [{ severity: 'info', message: 'Resolved by reviewer' }]) } : {}),
        route: mkStage(STATUS.PASSED, null, [{ severity: 'info', message: 'Approved & posted to ERP by reviewer' }]),
      },
    } }));
    closeSheet();
  }, [closeSheet]);
  const onReject = useCallback((pinv, reason, secondsInReview) => {
    if (!pinv) return;
    logDecision({ invoiceId: pinv.id, vendor: pinv.routed?.normalisedVendor || pinv.vendorName, decision: 'reject', reason, secondsInReview });
    const stage = pinv.stoppedAt || 'validate';
    setPatched(p => ({ ...p, [pinv.id]: {
      ...pinv,
      overallStatus: STATUS.REJECTED,
      valueAtRisk: 0,
      stages: { ...pinv.stages, [stage]: mkStage(STATUS.REJECTED, null, [{ severity: 'error', message: `Rejected by reviewer: ${reason}` }]) },
    } }));
    closeSheet();
  }, [closeSheet]);

  // Lifecycle tab + funnel segment are mutually exclusive filters.
  const onLifecycle = useCallback((status) => {
    setLifecycleFilter(prev => (prev === status ? null : status));
    setWorklistFilter(null);
    setSelectedPipelineId(null);
  }, []);
  const onSegment = useCallback((stage, status) => {
    setWorklistFilter({ stage, status });
    setLifecycleFilter(null);
    setSelectedPipelineId(null);
  }, []);

  // Keyboard shortcut: D → demo mode
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'd' || e.key === 'D') runDemo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isExtracting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes the Add-documents menu / Eval slide-over.
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { setAddMenuOpen(false); setEvalOpen(false); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const startProgressAnimation = useCallback(() => {
    setProgress(0);
    let p = 0;
    progressTimerRef.current = setInterval(() => {
      p += Math.random() * 12 + 4;
      if (p >= 92) { p = 92; clearInterval(progressTimerRef.current); }
      setProgress(Math.min(p, 92));
    }, 120);
  }, []);

  const finishProgress = useCallback(() => {
    clearInterval(progressTimerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
  }, []);

  // Inject a freshly extracted invoice into the batch worklist: pin it to the
  // top of the queue with a NEW badge and clear any filter so it's visible. We
  // deliberately don't fling the review sheet open — the operator clicks the row
  // when ready (auto-opening on every ingest is jarring with a slide-over).
  const injectLiveInvoice = useCallback((extracted, idSuffix, scenario, source) => {
    const seq = ++liveSeq.current;
    const id = `INV-LIVE-${seq}-${idSuffix}`;
    const liveInv = {
      ...extracted,
      id,
      invoiceNumber: extracted.invoiceNumber || `INV-LIVE-${seq}`,
      vendorName: extracted.vendorRaw || 'Unknown Vendor',
      scenario: scenario || extracted.scenario || 'Live ingest',
      sourceUrl: source?.url || extracted.sourceUrl || null,
      sourceFile: source?.name || extracted.sourceFile || null,
    };
    setLiveRaw(prev => [liveInv, ...prev]);
    setWorklistFilter(null);
    setLifecycleFilter(null);
  }, []);

  // Demo mode: inject pre-baked Matheson result (always the Demo engine)
  const runDemo = useCallback(async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setExtractError('');
    startProgressAnimation();
    await new Promise(r => setTimeout(r, 500));
    finishProgress();
    setIsExtracting(false);
    injectLiveInvoice(
      { ...DEMO_MATHESON, extractionEngine: 'Demo', extractionEngineId: 'demo', extractionMs: 480 },
      'DEMO',
      'Demo — Matheson Tri-Gas',
    );
  }, [isExtracting, startProgressAnimation, finishProgress, injectLiveInvoice]);

  // Extract a single file (dropped or chosen via the file picker) through the
  // selected engine and inject it. An object URL lets the PDF render in the
  // inspector's source pane.
  const ingestFile = useCallback(async (file) => {
    if (!file || isExtracting) return;
    setIsExtracting(true);
    setExtractError('');
    startProgressAnimation();
    try {
      const extracted = await runExtraction(engine, file);
      finishProgress();
      const url = file.type === 'application/pdf' ? URL.createObjectURL(file) : null;
      injectLiveInvoice(extracted, String(Date.now()).slice(-6), null, { url, name: file.name });
    } catch (err) {
      console.error('Extraction error:', err);
      setExtractError(err.message || 'Extraction failed');
      finishProgress();
    } finally {
      setIsExtracting(false);
    }
  }, [engine, isExtracting, startProgressAnimation, finishProgress, injectLiveInvoice]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    ingestFile(e.dataTransfer?.files?.[0]);
  }, [ingestFile]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>

      {/* Top bar — indigo brand bar */}
      <div style={{
        padding: '0 18px', display: 'flex', alignItems: 'center', gap: 0,
        height: 48, flexShrink: 0, background: 'var(--accent)',
      }}>
        <div style={{
          color: '#fff', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', gap: 9, paddingRight: 22, marginRight: 8, whiteSpace: 'nowrap',
        }}>
          <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: 16, height: 16 }}>
            <span style={{ background: '#fff', borderRadius: 2 }} />
            <span style={{ background: '#fff', borderRadius: 2 }} />
            <span style={{ background: '#fff', borderRadius: 2, opacity: 0.5 }} />
            <span style={{ background: '#fff', borderRadius: 2, opacity: 0.7 }} />
          </span>
          Invoice Automation
        </div>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>Batch Pipeline</span>
        <div style={{ flex: 1 }} />
        {/* Learning flywheel readout — grows as reviewers teach the matcher */}
        <div title="Aliases the matcher has learned from reviewer corrections (persisted across reloads)" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginRight: 14, color: '#fff',
          fontFamily: 'var(--mono)', fontSize: 11.5, background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.28)', borderRadius: 7, padding: '5px 10px',
        }}>
          <span>🧠 {learning.aliases} learned</span>
          <span style={{ opacity: 0.55 }}>·</span>
          <span style={{ opacity: 0.85 }}>{learning.corrections} corrections</span>
          {(learning.aliases > 0 || learning.corrections > 0) && (
            <button onClick={resetLearning} title="Reset learned state (demo)"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 11, padding: '0 2px', cursor: 'pointer', textDecoration: 'underline' }}>
              reset
            </button>
          )}
        </div>
        <button className="topbar-btn" onClick={() => setEvalOpen(true)} style={{ marginRight: 14 }}>📊 Eval &amp; STP trend</button>
        <span style={{
          width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.4)',
          color: '#fff', fontFamily: 'var(--mono)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>NA</span>
      </div>

      {/* Single page — the Document Queue */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Fixed header zone — page head · add-documents · KPIs · tabs · funnel */}
            <div style={{ flexShrink: 0, width: '100%', maxWidth: 1440, margin: '0 auto', padding: '18px 24px 0' }}>

              {/* Page head + tolerance dial */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600 }}>Document Queue</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Batch {BATCH_ID} · {batch.totalCount.toLocaleString()} invoices from {(batch.intake?.filesReceived ?? batch.totalCount).toLocaleString()} source files
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* Add documents — popover menu (every intake path lives here) */}
                  <div style={{ position: 'relative' }}>
                    <button className={`add-toggle${addMenuOpen ? ' open' : ''}`} onClick={() => setAddMenuOpen(o => !o)} aria-haspopup="true" aria-expanded={addMenuOpen}>
                      <span className="chev">▸</span> Add documents
                    </button>
                    {addMenuOpen && (
                      <>
                        <div onClick={() => setAddMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                        <div className="add-menu" role="menu">
                          <label className="add-drop"
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { handleDrop(e); setAddMenuOpen(false); }}
                            style={{ marginTop: 10, borderColor: dragOver ? 'var(--accent)' : 'var(--border2)', background: dragOver ? 'var(--accent-soft)' : '#fff' }}>
                            ⬇ Drop a PDF or <span style={{ color: 'var(--accent)', fontWeight: 600 }}>choose a file</span>
                            <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setAddMenuOpen(false); ingestFile(f); }} />
                          </label>
                          <div className="add-menu-sec" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>Or try it out</div>
                          <button className="add-menu-item" disabled={isExtracting} onClick={() => { setAddMenuOpen(false); runDemo(); }}>
                            <span>▶</span><span><b>Run demo</b><span className="ami-sub">Drops a sample invoice into the queue</span></span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ width: 1, height: 22, background: 'var(--border2)' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Variance tolerance</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {TOLERANCES.map(t => (
                      <button key={t} onClick={() => setTolerance(t)} className={`tol-btn${tolerance === t ? ' tol-active' : ''}`}>
                        {t}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Intake feedback — progress + errors */}
              {isExtracting && (
                <div style={{ marginBottom: 14, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.15s ease' }} />
                </div>
              )}
              {extractError && (
                <div style={{ padding: '8px 12px', marginBottom: 14, background: 'var(--red-bg)', border: '1px solid #f3b4b4', borderRadius: 8, color: 'var(--red)', fontSize: 12.5 }}>
                  ⚠ {extractError}
                </div>
              )}

              {/* KPI cards */}
              <KpiCards batch={batch} />

              {/* Lifecycle tabs + Pipeline-view toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                <button className={`ftab${!lifecycleFilter && !worklistFilter ? ' ftab-on' : ''}`}
                  onClick={() => { setLifecycleFilter(null); setWorklistFilter(null); setSelectedPipelineId(null); }}>
                  All <span className="ftab-ct">{displayInvoices.length.toLocaleString()}</span>
                </button>
                {[
                  ['needs_review', 'Needs review'], ['auto_resolved', 'Auto-resolved'], ['passed', 'Passed'], ['failed', 'Failed'],
                  // Human-action outcomes appear once there's at least one (e.g. after Approve/Reject in the demo).
                  ...(lifecycleCounts.posted ? [['posted', 'Posted']] : []),
                  ...(lifecycleCounts.rejected ? [['rejected', 'Rejected']] : []),
                ].map(([st, label]) => (
                  <button key={st} className={`ftab${lifecycleFilter === st ? ' ftab-on' : ''}`} onClick={() => onLifecycle(st)}>
                    {label} <span className="ftab-ct">{lifecycleCounts[st].toLocaleString()}</span>
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button className={`funnel-toggle${funnelOpen ? ' open' : ''}`} onClick={() => setFunnelOpen(o => !o)}>
                  <span className="chev">▸</span> Pipeline view
                </button>
              </div>

              {funnelOpen && (
                <BatchFunnel batch={batch} activeFilter={worklistFilter} onSegmentClick={onSegment} />
              )}
            </div>

            {/* Table zone — fills remaining height; the table virtualizes internally */}
            <div style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 1440, margin: '0 auto', padding: '0 24px 18px', display: 'flex', flexDirection: 'column' }}>
              <Worklist
                invoices={filteredBatch}
                totalCount={displayInvoices.length}
                selectedId={selectedPipelineId}
                onSelect={selectInvoice}
                filter={worklistFilter}
                onClearFilter={() => setWorklistFilter(null)}
              />
            </div>

            {/* Slide-over review page */}
            <ReviewSheet
              pinv={selectedPinv}
              activeStage={activeStage}
              onStageClick={setActiveStage}
              busy={isExtracting}
              onEditField={onEditField}
              onReextract={onReextract}
              onAccept={onAcceptExtract}
              onResolveLine={onResolveLine}
              onApprove={onApprove}
              onReject={onReject}
              onClose={closeSheet}
            />
          </div>

      </div>

      {/* Eval & STP — slide-over (opened from the top bar) */}
      {evalOpen && (
        <>
          <div onClick={() => setEvalOpen(false)} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,45,0.42)', zIndex: 55 }} />
          <aside role="dialog" aria-modal="true" aria-label="AI Eval and STP trend" style={{
            position: 'fixed', top: 0, right: 0, height: '100%', width: '92%', maxWidth: 1100, background: 'var(--surface)',
            boxShadow: '-12px 0 40px rgba(20,24,45,0.18)', zIndex: 56, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ background: 'var(--accent)', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
              <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>📊 AI Eval &amp; STP Trend</span>
              <button onClick={() => setEvalOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, lineHeight: 1, padding: '2px 7px' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <EvalDashboard flywheel={flywheel} batch={batch} invoices={displayInvoices} decisions={decisions} />
            </div>
          </aside>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* Top-bar button (Eval) */
        .topbar-btn {
          background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.32); color: #fff;
          font-family: var(--mono); font-size: 12px; border-radius: 7px; padding: 6px 12px;
        }
        .topbar-btn:hover { background: rgba(255,255,255,0.24); }

        /* Add-documents popover menu */
        .add-menu {
          position: absolute; top: calc(100% + 8px); left: 0; z-index: 31; width: 330px;
          background: #fff; border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 12px 32px rgba(20,24,45,0.16); padding: 8px 0; max-height: 72vh; overflow-y: auto;
        }
        .add-menu-sec {
          font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em;
          color: var(--faint); padding: 8px 12px 4px;
        }
        .add-menu-item {
          width: 100%; display: flex; align-items: flex-start; gap: 10px; text-align: left;
          background: none; border: none; padding: 8px 12px; font-size: 13px; color: var(--text);
        }
        .add-menu-item > span:first-child { width: 18px; flex-shrink: 0; text-align: center; }
        .add-menu-item > span:last-child { display: flex; flex-direction: column; }
        .add-menu-item:hover:not(:disabled) { background: var(--accent-soft); }
        .add-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
        .ami-sub { font-size: 11px; color: var(--faint); font-weight: 400; }
        .add-drop {
          display: block; margin: 0 12px 10px; padding: 12px; border: 1.5px dashed var(--border2);
          border-radius: 8px; font-size: 12.5px; color: var(--muted); text-align: center; cursor: pointer;
        }

        /* Lifecycle filter tabs */
        .ftab {
          display: inline-flex; align-items: center; gap: 7px; background: #fff;
          border: 1px solid var(--border2); border-radius: 8px; padding: 7px 12px;
          font-size: 12.5px; color: var(--muted); transition: all 0.12s;
        }
        .ftab:hover { border-color: var(--accent); color: var(--accent); }
        .ftab-on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-deep); font-weight: 600; }
        .ftab-ct { font-family: var(--mono); font-size: 11px; padding: 1px 7px; border-radius: 9px; background: rgba(0,0,0,0.06); color: inherit; }
        .ftab-on .ftab-ct { background: #fff; }

        /* Pipeline-view toggle */
        .funnel-toggle {
          display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 12px;
          color: var(--accent); background: var(--accent-soft); border: 1px solid #dcdcfb; border-radius: 7px; padding: 6px 11px;
        }
        .funnel-toggle:hover { background: #e4e6fe; }
        .funnel-toggle .chev { display: inline-block; transition: transform 0.18s ease; }
        .funnel-toggle.open .chev { transform: rotate(90deg); }

        /* Add-documents toggle (page head) */
        .add-toggle {
          display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 12px;
          color: var(--accent); background: var(--accent-soft); border: 1px solid #dcdcfb; border-radius: 7px; padding: 6px 11px;
        }
        .add-toggle:hover { background: #e4e6fe; }
        .add-toggle .chev { display: inline-block; transition: transform 0.18s ease; }
        .add-toggle.open .chev { transform: rotate(90deg); }

        /* Tolerance buttons */
        .tol-btn {
          padding: 5px 12px;
          background: #fff;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          color: #475569;
          font-size: 13px;
          font-weight: 500;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tol-btn:hover {
          border-color: #818cf8;
          color: #4f46e5;
          background: #eef2ff;
        }
        .tol-btn:active {
          background: #e0e7ff;
        }
        .tol-active {
          background: #4f46e5 !important;
          border-color: #4f46e5 !important;
          color: #fff !important;
          font-weight: 700 !important;
        }

        /* Demo button */
        .demo-btn {
          padding: 7px 16px;
          background: #eef2ff;
          border: 1.5px solid #818cf8;
          border-radius: 6px;
          color: #4f46e5;
          font-size: 13px;
          font-weight: 700;
          font-family: 'IBM Plex Mono', monospace;
          transition: all 0.15s;
        }
        .demo-btn:hover {
          background: #e0e7ff;
          border-color: #4f46e5;
        }
        .demo-btn:active {
          background: #c7d2fe;
        }

        /* Extraction engine buttons */
        .eng-btn {
          padding: 6px 12px;
          background: #fff;
          border: 1.5px solid #ddd6fe;
          border-radius: 6px;
          color: #6d28d9;
          font-size: 12px;
          font-weight: 600;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
        }
        .eng-btn:hover:not(:disabled) {
          border-color: #a78bfa;
          background: #f5f3ff;
        }
        .eng-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .eng-active {
          background: #7c3aed !important;
          border-color: #7c3aed !important;
          color: #fff !important;
          font-weight: 700 !important;
        }

        /* /input ingestion buttons */
        .ingest-btn {
          padding: 5px 12px;
          background: #ede9fe;
          border: 1px solid #c4b5fd;
          border-radius: 6px;
          color: #6d28d9;
          font-size: 12px;
          font-weight: 700;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ingest-btn:hover:not(:disabled) { background: #ddd6fe; }
        .ingest-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ingest-chip {
          padding: 5px 10px;
          background: #faf8ff;
          border: 1px solid #ede9fe;
          border-radius: 6px;
          color: #1e293b;
          font-size: 12px;
          font-weight: 600;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          max-width: 170px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: background 0.1s;
        }
        .ingest-chip:hover:not(:disabled) { background: #f0ebff; border-color: #c4b5fd; }
        .ingest-chip:disabled { opacity: 0.6; cursor: not-allowed; }
        .statement-chip {
          background: #ede9fe;
          border: 1px dashed #a78bfa;
          color: #6d28d9;
          font-weight: 700;
        }
        .statement-chip:hover:not(:disabled) { background: #ddd6fe; border-color: #7c3aed; }
      `}</style>
    </div>
  );
}
