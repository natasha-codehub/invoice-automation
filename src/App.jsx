import { useState, useEffect, useRef, useCallback } from 'react';
import { sampleInvoices } from './data/invoices.js';
import { routeInvoice } from './utils/router.js';
import { mockExtract, DEMO_MATHESON } from './utils/mockExtractor.js';
import InvoiceList from './components/InvoiceList.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import EvalDashboard from './components/EvalDashboard.jsx';
import StoryTab from './components/StoryTab.jsx';

const TABS = ['Invoice Processor', 'AI Eval & STP Trend', 'PM Story'];
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
  const progressTimerRef = useRef(null);

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

  const injectLiveInvoice = useCallback((extracted, idSuffix) => {
    const liveInv = {
      ...extracted,
      id: `INV-LIVE-${idSuffix}`,
      invoiceNumber: extracted.invoiceNumber || `INV-LIVE-${idSuffix}`,
      vendorName: extracted.vendorRaw || 'Unknown Vendor',
      scenario: 'Live Upload',
    };
    setLiveInvoices(prev => [liveInv, ...prev]);
    setSelectedIdx(0);
    setActiveTab(0);
  }, []);

  // Demo mode: inject pre-baked Matheson result
  const runDemo = useCallback(async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setActiveTab(0);
    startProgressAnimation();
    await new Promise(r => setTimeout(r, 500));
    finishProgress();
    setIsExtracting(false);
    injectLiveInvoice({ ...DEMO_MATHESON }, 'DEMO');
  }, [isExtracting, startProgressAnimation, finishProgress, injectLiveInvoice]);

  // Handle actual file drop
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (isExtracting) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    startProgressAnimation();
    try {
      const extracted = await mockExtract(file);
      finishProgress();
      injectLiveInvoice(extracted, Date.now());
    } catch (err) {
      console.error('Extraction error:', err);
      finishProgress();
    } finally {
      setIsExtracting(false);
    }
  }, [isExtracting, startProgressAnimation, finishProgress, injectLiveInvoice]);

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
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        height: 48,
        flexShrink: 0,
      }}>
        <div style={{
          color: 'var(--text-dim)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          paddingRight: 28,
          borderRight: '1px solid var(--border)',
          marginRight: 20,
        }}>
          INVOICE AUTOMATION
        </div>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === i ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === i ? 'var(--text)' : 'var(--muted)',
              fontSize: 12,
              padding: '0 16px',
              cursor: 'pointer',
              fontWeight: activeTab === i ? 600 : 400,
              letterSpacing: '0.03em',
              transition: 'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>D = demo mode</span>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── Tab 0: Invoice Processor ── */}
        {activeTab === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexShrink: 0,
              background: 'var(--surface)',
            }}>
              {/* Tolerance dial */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>Variance Tolerance</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {TOLERANCES.map(t => (
                    <button
                      key={t}
                      onClick={() => setTolerance(t)}
                      style={{
                        padding: '4px 10px',
                        background: tolerance === t ? 'var(--accent)' : 'transparent',
                        border: `1px solid ${tolerance === t ? 'var(--accent)' : 'var(--border2)'}`,
                        borderRadius: 4,
                        color: tolerance === t ? '#fff' : 'var(--text-dim)',
                        fontSize: 11,
                        fontWeight: tolerance === t ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {t}%
                    </button>
                  ))}
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 10, fontStyle: 'italic' }}>
                  Negotiated with finance team · loosened as model confidence builds
                </span>
              </div>

              <div style={{ flex: 1 }} />

              {/* Demo button */}
              <button
                onClick={runDemo}
                disabled={isExtracting}
                style={{
                  padding: '5px 14px',
                  background: 'var(--accent)22',
                  border: '1px solid var(--accent)55',
                  borderRadius: 4,
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: isExtracting ? 'not-allowed' : 'pointer',
                  opacity: isExtracting ? 0.5 : 1,
                }}
              >
                ▶ Run demo
              </button>
            </div>

            {/* Summary stat chips */}
            <div style={{
              padding: '10px 20px',
              display: 'flex',
              gap: 10,
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
            }}>
              {BUCKET_ORDER.map(b => (
                <div key={b} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 12px',
                  background: 'var(--surface)',
                  border: `1px solid ${BUCKET_COLORS[b]}33`,
                  borderRadius: 4,
                }}>
                  <span style={{ color: BUCKET_COLORS[b], fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{counts[b]}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>{BUCKET_LABELS[b]}</span>
                </div>
              ))}
              <div style={{ color: 'var(--muted)', fontSize: 10, alignSelf: 'center', marginLeft: 4 }}>
                {results.length} invoices · tolerance {tolerance}%
              </div>
            </div>

            {/* Split panel */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* Left column: drop zone + list */}
              <div style={{ width: 290, minWidth: 290, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    margin: '10px 10px 0',
                    border: `1px dashed ${dragOver ? 'var(--accent)' : isExtracting ? 'var(--accent)' : 'var(--border2)'}`,
                    borderRadius: 6,
                    padding: '12px 10px',
                    background: dragOver ? 'var(--accent)0d' : 'transparent',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                    cursor: 'default',
                  }}
                >
                  {isExtracting ? (
                    <div>
                      <div style={{
                        color: 'var(--accent)',
                        fontSize: 11,
                        marginBottom: 8,
                        animation: 'pulse 1.4s ease-in-out infinite',
                      }}>
                        Extracting with AI...
                      </div>
                      <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2 }}>
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
                      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 2 }}>
                        Drop invoice image here · PDF or photo
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 10 }}>
                        Simulates Claude Vision extraction
                      </div>
                    </div>
                  )}
                </div>

                {/* Invoice list */}
                <div style={{ flex: 1, overflow: 'hidden', marginTop: 6 }}>
                  <InvoiceList
                    results={results}
                    selectedIdx={selectedIdx}
                    onSelect={setSelectedIdx}
                  />
                </div>
              </div>

              {/* Detail panel */}
              <DetailPanel result={results[selectedIdx] || null} />
            </div>
          </div>
        )}

        {/* ── Tab 1: Eval Dashboard ── */}
        {activeTab === 1 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <EvalDashboard results={results} />
          </div>
        )}

        {/* ── Tab 2: PM Story ── */}
        {activeTab === 2 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <StoryTab />
          </div>
        )}

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
