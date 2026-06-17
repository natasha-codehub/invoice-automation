import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sampleInvoices } from './data/invoices.js';
import { routeInvoice } from './utils/router.js';
import { DEMO_MATHESON } from './utils/mockExtractor.js';
import { runExtraction, PROVIDERS, getProvider } from './utils/extraction/providers.js';
import { inputFiles, inputFileCount } from './data/inputInvoices.js';
import { generateBatch } from './pipeline/generateBatch.js';
import { runPipeline } from './pipeline/runPipeline.js';
import { aggregateBatch } from './pipeline/aggregateBatch.js';
import InvoiceList from './components/InvoiceList.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import EvalDashboard from './components/EvalDashboard.jsx';
import BatchFunnel from './components/BatchFunnel.jsx';
import Worklist from './components/Worklist.jsx';
import InvoiceStepper from './components/InvoiceStepper.jsx';
import ExtractionInspector from './components/ExtractionInspector.jsx';
const TABS = ['Batch Pipeline', 'Invoice Processor', 'AI Eval & STP Trend'];
const TOLERANCES = [1, 2, 3, 5];

const BUCKET_ORDER = ['STRAIGHT_THROUGH', 'AUTO_CORRECTED', 'HUMAN_REVIEW', 'AUTO_REJECTED'];
const BUCKET_COLORS = {
  STRAIGHT_THROUGH: 'var(--green)',
  AUTO_CORRECTED: '#06b6d4',
  HUMAN_REVIEW: 'var(--amber)',
  AUTO_REJECTED: 'var(--red)',
};
const BUCKET_LABELS = {
  STRAIGHT_THROUGH: 'Straight Through',
  AUTO_CORRECTED: 'Auto-Corrected',
  HUMAN_REVIEW: 'Human Review',
  AUTO_REJECTED: 'Auto-Rejected',
};

const PASTEL_BG = {
  STRAIGHT_THROUGH: '#dcfce7',
  AUTO_CORRECTED:   '#cffafe',
  HUMAN_REVIEW:     '#fef9c3',
  AUTO_REJECTED:    '#fee2e2',
};

function buildResults(invoiceList, tolerance) {
  return invoiceList.map(inv => routeInvoice(inv, tolerance));
}

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [tolerance, setTolerance] = useState(2);
  const [liveInvoices, setLiveInvoices] = useState([]);
  const [results, setResults] = useState(() => buildResults(sampleInvoices, 2));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [engine, setEngine] = useState(() => localStorage.getItem('extractionEngine') || 'demo');
  const [extractError, setExtractError] = useState('');
  const progressTimerRef = useRef(null);
  const liveSeq = useRef(0);

  // Persist the chosen extraction engine (Layer-1 seam selection)
  useEffect(() => { localStorage.setItem('extractionEngine', engine); }, [engine]);

  // ── Batch Pipeline (Phase A/B): one mock intake batch, 3 zoom levels ──
  const pipeline = useMemo(() => generateBatch(1000, 2), []);
  const [worklistFilter, setWorklistFilter] = useState(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [activeStage, setActiveStage] = useState(null);
  const [patched, setPatched] = useState({}); // id → re-piped PipelineInvoice (edits/re-runs)

  // Apply edits/re-runs on top of the generated batch; funnel reflects them live.
  const displayInvoices = useMemo(
    () => pipeline.invoices.map(inv => patched[inv.id] || inv),
    [pipeline, patched],
  );
  const batch = useMemo(() => aggregateBatch(displayInvoices, pipeline.batch.id), [displayInvoices, pipeline]);

  const filteredBatch = useMemo(() => {
    if (!worklistFilter) return displayInvoices;
    return displayInvoices.filter(inv => inv.stages[worklistFilter.stage]?.status === worklistFilter.status);
  }, [displayInvoices, worklistFilter]);

  const selectedPinv = useMemo(
    () => displayInvoices.find(inv => inv.id === selectedPipelineId) || null,
    [displayInvoices, selectedPipelineId],
  );

  // Re-pipe an invoice after a human edit / accept / re-extract, keeping human + engine traces.
  const repipeWith = useCallback((cur, ext, trace, accept = false) => {
    const carried = (cur.traces || []).filter(t => {
      const a = String(t.actor || '');
      return a.startsWith('human') || a.startsWith('engine');
    });
    const repiped = runPipeline(ext, 2, cur.batchId, { acceptExtract: accept, extraTraces: [...carried, trace] });
    setPatched(p => ({ ...p, [cur.id]: repiped }));
  }, []);

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

  // Re-run router whenever tolerance or live invoices change
  useEffect(() => {
    const all = [...liveInvoices, ...sampleInvoices];
    setResults(buildResults(all, tolerance));
  }, [tolerance, liveInvoices]);

  // Keyboard shortcut: D → demo mode
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'd' || e.key === 'D') runDemo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isExtracting]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const injectLiveInvoice = useCallback((extracted, idSuffix, scenario) => {
    const seq = ++liveSeq.current;
    const liveInv = {
      ...extracted,
      id: `INV-LIVE-${seq}-${idSuffix}`,
      invoiceNumber: extracted.invoiceNumber || `INV-LIVE-${seq}`,
      vendorName: extracted.vendorRaw || 'Unknown Vendor',
      scenario: scenario || extracted.scenario || 'Live Upload',
    };
    setLiveInvoices(prev => [liveInv, ...prev]);
    setSelectedIdx(0);
    setActiveTab(1);
  }, []);

  // Run a bundled /input file through the selected engine and inject the result.
  // Native (key-required) engines need the actual bytes; demo uses the filename.
  const extractAndInject = useCallback(async (f) => {
    const provider = getProvider(engine);
    let file = null;
    if (provider.requiresKey) {
      const blob = await fetch(f.url).then(r => r.blob());
      file = new File([blob], f.name, { type: blob.type });
    }
    const extracted = await runExtraction(engine, file, { sourceName: f.name, url: f.url });
    injectLiveInvoice(extracted, f.name.replace(/[^a-z0-9]/gi, '').slice(0, 14), f.scenario);
  }, [engine, injectLiveInvoice]);

  // Demo mode: inject pre-baked Matheson result (always the Demo engine)
  const runDemo = useCallback(async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(1);
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

  // Handle actual file drop → selected engine
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (isExtracting) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    setExtractError('');
    startProgressAnimation();
    try {
      const extracted = await runExtraction(engine, file);
      finishProgress();
      injectLiveInvoice(extracted, Date.now());
    } catch (err) {
      console.error('Extraction error:', err);
      setExtractError(err.message || 'Extraction failed');
      finishProgress();
    } finally {
      setIsExtracting(false);
    }
  }, [engine, isExtracting, startProgressAnimation, finishProgress, injectLiveInvoice]);

  // Ingest one bundled /input invoice
  const ingestOne = useCallback(async (f) => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(1);
    setExtractError('');
    startProgressAnimation();
    try {
      await extractAndInject(f);
      finishProgress();
    } catch (err) {
      console.error('Ingestion error:', err);
      setExtractError(err.message || 'Ingestion failed');
      finishProgress();
    } finally {
      setIsExtracting(false);
    }
  }, [isExtracting, extractAndInject, startProgressAnimation, finishProgress]);

  // Ingest the whole /input batch (reversed so the first file lands on top)
  const ingestInput = useCallback(async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(1);
    setExtractError('');
    try {
      for (const f of [...inputFiles].reverse()) {
        startProgressAnimation();
        await extractAndInject(f);
        finishProgress();
        await new Promise(r => setTimeout(r, 180));
      }
    } catch (err) {
      console.error('Batch ingestion error:', err);
      setExtractError(err.message || 'Batch ingestion failed');
      finishProgress();
    } finally {
      setIsExtracting(false);
    }
  }, [isExtracting, extractAndInject, startProgressAnimation, finishProgress]);

  const counts = BUCKET_ORDER.reduce((acc, b) => {
    acc[b] = results.filter(r => r.bucket === b).length;
    return acc;
  }, {});

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>

      {/* Top bar */}
      <div style={{
        borderBottom: '2px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        height: 56,
        flexShrink: 0,
        background: 'var(--surface)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      }}>
        <div style={{
          color: 'var(--text)',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          paddingRight: 28,
          borderRight: '2px solid var(--border)',
          marginRight: 24,
          whiteSpace: 'nowrap',
        }}>
          Invoice Automation
        </div>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`tab-btn${activeTab === i ? ' tab-active' : ''}`}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>D = demo mode</span>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── Tab 1: Invoice Processor ── */}
        {activeTab === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexShrink: 0,
              background: '#fafbff',
            }}>
              {/* Tolerance dial */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 600 }}>Variance Tolerance</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TOLERANCES.map(t => (
                    <button
                      key={t}
                      onClick={() => setTolerance(t)}
                      className={`tol-btn${tolerance === t ? ' tol-active' : ''}`}
                    >
                      {t}%
                    </button>
                  ))}
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
                  Negotiated with finance team · loosened as model confidence builds
                </span>
              </div>

              <div style={{ flex: 1 }} />

              {/* Demo button */}
              <button
                onClick={runDemo}
                disabled={isExtracting}
                className="demo-btn"
                style={{ opacity: isExtracting ? 0.5 : 1, cursor: isExtracting ? 'not-allowed' : 'pointer' }}
              >
                ▶ Run demo
              </button>
            </div>

            {/* Summary stat chips */}
            <div style={{
              padding: '12px 20px',
              display: 'flex',
              gap: 10,
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: '#f8fafc',
            }}>
              {BUCKET_ORDER.map(b => (
                <div key={b} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  background: PASTEL_BG[b],
                  border: `1px solid ${BUCKET_COLORS[b]}44`,
                  borderRadius: 8,
                }}>
                  <span style={{ color: BUCKET_COLORS[b], fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{counts[b]}</span>
                  <span style={{ color: BUCKET_COLORS[b], fontSize: 13, fontWeight: 600 }}>{BUCKET_LABELS[b]}</span>
                </div>
              ))}
              <div style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center', marginLeft: 6 }}>
                {results.length} invoices · tolerance {tolerance}%
              </div>
            </div>

            {/* Split panel */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* Left column: drop zone + list — lavender pastel tint */}
              <div style={{
                width: 300,
                minWidth: 300,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#f5f3ff',
                borderRight: '2px solid #ddd6fe',
              }}>

                {/* Extraction engine selector — Layer-1 seam */}
                <div style={{ padding: '12px 12px 4px' }}>
                  <div style={{ color: '#5b21b6', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>
                    EXTRACTION ENGINE
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {PROVIDERS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setEngine(p.id)}
                        disabled={isExtracting}
                        title={p.description}
                        className={`eng-btn${engine === p.id ? ' eng-active' : ''}`}
                      >
                        {p.short}
                      </button>
                    ))}
                  </div>
                  <div style={{ color: '#7c3aed', fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>
                    {getProvider(engine).description}
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    margin: '12px 12px 6px',
                    border: `2px dashed ${dragOver ? 'var(--accent)' : isExtracting ? 'var(--accent)' : '#c4b5fd'}`,
                    borderRadius: 8,
                    padding: '14px 12px',
                    background: dragOver ? '#ede9fe' : '#ede9fe88',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                    cursor: 'default',
                  }}
                >
                  {isExtracting ? (
                    <div>
                      <div style={{
                        color: 'var(--accent)',
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 8,
                        animation: 'pulse 1.4s ease-in-out infinite',
                      }}>
                        Extracting with AI...
                      </div>
                      <div style={{ height: 4, background: '#ddd6fe', borderRadius: 2 }}>
                        <div style={{
                          height: '100%',
                          width: `${progress}%`,
                          background: 'var(--accent)',
                          borderRadius: 2,
                          transition: 'width 0.15s ease',
                        }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color: '#5b21b6', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                        Drop invoice image here
                      </div>
                      <div style={{ color: '#7c3aed', fontSize: 12 }}>
                        PDF or photo · simulates Claude Vision extraction
                      </div>
                    </div>
                  )}
                </div>

                {/* Extraction error */}
                {extractError && (
                  <div style={{ margin: '0 12px 6px', padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 12, lineHeight: 1.4 }}>
                    ⚠ {extractError}
                  </div>
                )}

                {/* /input folder ingestion — bundled at build time */}
                <div style={{ margin: '4px 12px 8px', border: '1px solid #ddd6fe', borderRadius: 8, background: '#faf8ff', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #ede9fe' }}>
                    <span style={{ color: '#5b21b6', fontSize: 12, fontWeight: 700 }}>
                      📁 /input · {inputFileCount} detected
                    </span>
                    <button onClick={ingestInput} disabled={isExtracting} className="ingest-btn">
                      Ingest all
                    </button>
                  </div>
                  {inputFiles.map(f => (
                    <button
                      key={f.name}
                      onClick={() => ingestOne(f)}
                      disabled={isExtracting}
                      className="ingest-row"
                      title={`${f.name}\n${f.scenario}`}
                    >
                      <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.vendorPreview || f.name}
                      </span>
                      {f.totalPreview != null && (
                        <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                          ₹{f.totalPreview.toLocaleString()}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Invoice list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <InvoiceList
                    results={results}
                    selectedIdx={selectedIdx}
                    onSelect={setSelectedIdx}
                  />
                </div>
              </div>

              {/* Detail panel — clean white */}
              <div style={{ flex: 1, overflow: 'hidden', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
                <DetailPanel result={results[selectedIdx] || null} />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 0: Batch Pipeline ── */}
        {activeTab === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <BatchFunnel
              batch={batch}
              activeFilter={worklistFilter}
              onSegmentClick={(stage, status) => {
                setWorklistFilter({ stage, status });
                setSelectedPipelineId(null);
              }}
            />
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <Worklist
                invoices={filteredBatch}
                totalCount={displayInvoices.length}
                selectedId={selectedPipelineId}
                onSelect={(id) => {
                  setSelectedPipelineId(id);
                  const pinv = displayInvoices.find(i => i.id === id);
                  setActiveStage(pinv?.extraction ? 'extract' : (pinv?.stoppedAt || null));
                }}
                filter={worklistFilter}
                onClearFilter={() => setWorklistFilter(null)}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
                {selectedPinv ? (
                  <>
                    <InvoiceStepper pinv={selectedPinv} activeStage={activeStage} onStageClick={setActiveStage} />
                    {extractError && (
                      <div style={{ margin: '0 18px 8px', padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 12 }}>
                        ⚠ {extractError}
                      </div>
                    )}
                    {activeStage === 'extract' && selectedPinv.extraction ? (
                      <ExtractionInspector
                        pinv={selectedPinv}
                        onEditField={onEditField}
                        onReextract={onReextract}
                        onAccept={onAcceptExtract}
                      />
                    ) : (
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {selectedPinv.routed ? (
                          <DetailPanel result={selectedPinv.routed} />
                        ) : (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, padding: 24, textAlign: 'center' }}>
                            Synthetic batch invoice — full extraction &amp; validation detail is available for the 12 real invoices (samples + /input). Click the Extract node for invoices that have a source document.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
                    Select an invoice from the worklist
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 2: Eval Dashboard ── */}
        {activeTab === 2 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <EvalDashboard results={results} />
          </div>
        )}


      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* Tab buttons */
        .tab-btn {
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          color: #64748b;
          font-size: 14px;
          font-weight: 500;
          font-family: 'IBM Plex Mono', monospace;
          padding: 0 20px;
          height: 100%;
          cursor: pointer;
          letter-spacing: 0.01em;
          transition: all 0.15s;
        }
        .tab-btn:hover {
          background: #eef2ff;
          color: #4f46e5;
          border-bottom-color: #a5b4fc;
        }
        .tab-btn:active {
          background: #e0e7ff;
        }
        .tab-active {
          background: #eef2ff;
          color: #3730a3 !important;
          font-weight: 700 !important;
          border-bottom-color: #4f46e5 !important;
        }

        /* Tolerance buttons */
        .tol-btn {
          padding: 6px 14px;
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
          flex: 1;
          padding: 6px 8px;
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
          padding: 4px 10px;
          background: #ede9fe;
          border: 1px solid #c4b5fd;
          border-radius: 5px;
          color: #6d28d9;
          font-size: 11px;
          font-weight: 700;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ingest-btn:hover:not(:disabled) { background: #ddd6fe; }
        .ingest-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ingest-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 7px 10px;
          background: transparent;
          border: none;
          borderBottom: 1px solid #ede9fe;
          text-align: left;
          cursor: pointer;
          transition: background 0.1s;
        }
        .ingest-row:hover:not(:disabled) { background: #f0ebff; }
        .ingest-row:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
