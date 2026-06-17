import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sampleInvoices } from './data/invoices.js';
import { DEMO_MATHESON } from './utils/mockExtractor.js';
import { runExtraction, PROVIDERS, getProvider } from './utils/extraction/providers.js';
import { inputFiles, inputFileCount } from './data/inputInvoices.js';
import { bundledInvoices, generateSynthetic } from './pipeline/generateBatch.js';
import { runPipeline } from './pipeline/runPipeline.js';
import { aggregateBatch } from './pipeline/aggregateBatch.js';
import DetailPanel from './components/DetailPanel.jsx';
import EvalDashboard from './components/EvalDashboard.jsx';
import BatchFunnel from './components/BatchFunnel.jsx';
import Worklist from './components/Worklist.jsx';
import InvoiceStepper from './components/InvoiceStepper.jsx';
import ExtractionInspector from './components/ExtractionInspector.jsx';

const TABS = ['Batch Pipeline', 'AI Eval & STP Trend'];
const TOLERANCES = [1, 2, 3, 5];
const BATCH_ID = 'B-2026-0617';
const SYNTH_COUNT = 988; // + 12 real invoices ≈ a 1,000-doc intake batch

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [tolerance, setTolerance] = useState(2);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [engine, setEngine] = useState(() => localStorage.getItem('extractionEngine') || 'demo');
  const [extractError, setExtractError] = useState('');
  const progressTimerRef = useRef(null);
  const liveSeq = useRef(0);

  // ── Batch Pipeline: one intake batch, 3 zoom levels, now the only processing tab ──
  const [liveRaw, setLiveRaw] = useState([]);        // demo / drop / /input ingests (raw extractions)
  const [patched, setPatched] = useState({});        // id → re-piped PipelineInvoice (edits/re-runs)
  const [worklistFilter, setWorklistFilter] = useState(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [activeStage, setActiveStage] = useState(null);

  // Persist the chosen extraction engine (Layer-1 seam selection)
  useEffect(() => { localStorage.setItem('extractionEngine', engine); }, [engine]);

  // Tolerance is a global re-run: drop per-invoice edits so they don't apply
  // against a stale pipe (they're cheap to redo).
  useEffect(() => { setPatched({}); }, [tolerance]);

  // Real invoices (4 bundled ESPRIGAS + 8 samples) and the synthetic fill are
  // each built once; only the real + ingested set is re-piped on tolerance change,
  // so the funnel moves for reasons tolerance actually controls.
  const realRaw = useMemo(() => [...bundledInvoices(), ...sampleInvoices], []);
  const synthetic = useMemo(() => generateSynthetic(SYNTH_COUNT, BATCH_ID), []);
  const piped = useMemo(
    () => [...liveRaw, ...realRaw].map(inv => runPipeline(inv, tolerance, BATCH_ID)),
    [liveRaw, realRaw, tolerance],
  );

  const displayInvoices = useMemo(
    () => [...piped, ...synthetic].map(inv => patched[inv.id] || inv),
    [piped, synthetic, patched],
  );
  const batch = useMemo(() => aggregateBatch(displayInvoices, BATCH_ID), [displayInvoices]);

  const filteredBatch = useMemo(() => {
    if (!worklistFilter) return displayInvoices;
    return displayInvoices.filter(inv => inv.stages[worklistFilter.stage]?.status === worklistFilter.status);
  }, [displayInvoices, worklistFilter]);

  const selectedPinv = useMemo(
    () => displayInvoices.find(inv => inv.id === selectedPipelineId) || null,
    [displayInvoices, selectedPipelineId],
  );

  // Eval tab consumes the routed results (routeInvoice output) of the real +
  // ingested invoices — derived from the same unified model, no parallel flow.
  const results = useMemo(
    () => displayInvoices.filter(inv => inv.routed).map(inv => inv.routed),
    [displayInvoices],
  );

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

  // Inject a freshly extracted invoice into the batch worklist: pin it to the
  // top, auto-select it, and open it at the Extract stage.
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
    setActiveTab(0);
    setWorklistFilter(null);
    setSelectedPipelineId(id);
    setActiveStage('extract');
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
    injectLiveInvoice(extracted, f.name.replace(/[^a-z0-9]/gi, '').slice(0, 14), f.scenario, { url: f.url, name: f.name });
  }, [engine, injectLiveInvoice]);

  // Demo mode: inject pre-baked Matheson result (always the Demo engine)
  const runDemo = useCallback(async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(0);
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

  // Handle actual file drop → selected engine. An object URL lets the dropped
  // PDF render in the inspector's source pane.
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

  // Ingest one bundled /input invoice
  const ingestOne = useCallback(async (f) => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(0);
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
    setActiveTab(0);
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

        {/* ── Tab 0: Batch Pipeline (now the single processing surface) ── */}
        {activeTab === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Control toolbar — tolerance · engine · ingest · demo (merged from Invoice Processor) */}
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              flexWrap: 'wrap',
              flexShrink: 0,
              background: '#f5f3ff',
            }}>
              {/* Tolerance dial */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 700 }}>Variance Tolerance</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {TOLERANCES.map(t => (
                    <button key={t} onClick={() => setTolerance(t)} className={`tol-btn${tolerance === t ? ' tol-active' : ''}`}>
                      {t}%
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ width: 1, height: 26, background: '#ddd6fe' }} />

              {/* Extraction engine selector — Layer-1 seam */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#5b21b6', fontSize: 12, fontWeight: 700 }}>Engine</span>
                <div style={{ display: 'flex', gap: 5 }}>
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
              </div>

              <div style={{ width: 1, height: 26, background: '#ddd6fe' }} />

              {/* /input ingestion — bundled at build time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#5b21b6', fontSize: 12, fontWeight: 700 }}>📁 /input · {inputFileCount}</span>
                <button onClick={ingestInput} disabled={isExtracting} className="ingest-btn">Ingest all</button>
                {inputFiles.map(f => (
                  <button
                    key={f.name}
                    onClick={() => ingestOne(f)}
                    disabled={isExtracting}
                    className="ingest-chip"
                    title={`${f.name}\n${f.scenario}`}
                  >
                    {f.vendorPreview || f.name}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, minWidth: 12 }} />

              {/* Drop zone + demo */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: `1.5px dashed ${dragOver || isExtracting ? 'var(--accent)' : '#c4b5fd'}`,
                  borderRadius: 8, padding: '6px 12px', background: dragOver ? '#ede9fe' : '#ede9fe88',
                  minWidth: 200,
                }}
              >
                {isExtracting ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 4, animation: 'pulse 1.4s ease-in-out infinite' }}>
                      Extracting with AI…
                    </div>
                    <div style={{ height: 4, background: '#ddd6fe', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.15s ease' }} />
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#5b21b6', fontSize: 12, fontWeight: 600 }}>⬇ Drop invoice to extract</span>
                )}
              </div>
              <button onClick={runDemo} disabled={isExtracting} className="demo-btn" style={{ opacity: isExtracting ? 0.5 : 1, cursor: isExtracting ? 'not-allowed' : 'pointer' }}>
                ▶ Run demo
              </button>

              {extractError && (
                <div style={{ flexBasis: '100%', padding: '6px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 12 }}>
                  ⚠ {extractError}
                </div>
              )}
            </div>

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
                    {activeStage === 'extract' && selectedPinv.extraction ? (
                      <ExtractionInspector
                        pinv={selectedPinv}
                        busy={isExtracting}
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
                            Synthetic batch invoice — full extraction &amp; validation detail is available for the 12 real invoices (samples + /input) and anything you ingest. Click the Extract node for invoices that have a source document.
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

        {/* ── Tab 1: Eval Dashboard ── */}
        {activeTab === 1 && (
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
      `}</style>
    </div>
  );
}
