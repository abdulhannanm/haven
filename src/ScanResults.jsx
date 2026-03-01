import { useState, useEffect, useRef } from 'react';
import './ScanResults.css';

const ScanResults = ({ results, onClose, onNewScan }) => {
  const { scanId, duration, scanResults } = results;
  const findings = scanResults?.findings || [];

  const [agentUpdates, setAgentUpdates] = useState([]);
  const [containerLogs, setContainerLogs] = useState([]);
  const [agentDone, setAgentDone] = useState(false);
  const [summaryStarted, setSummaryStarted] = useState(false);
  const [summaryTexts, setSummaryTexts] = useState([]);
  const [displayedSummary, setDisplayedSummary] = useState('');
  const [agentScore, setAgentScore] = useState(null);
  const summaryStartedRef = useRef(false);
  const summaryEndRef = useRef(null);
  const updatesEndRef = useRef(null);
  const logsEndRef = useRef(null);

  // Main agent updates SSE (from post_update tool)
  useEffect(() => {
    if (!scanId) return;
    const src = new EventSource(`http://localhost:3001/api/agents/${scanId}/stream`);
    src.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setAgentUpdates(prev => [...prev, {
            text: data.message,
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString()
          }]);
        }
      } catch {}
    };
    src.onerror = () => {};
    return () => src.close();
  }, [scanId]);

  // Container logs SSE (docker logs)
  useEffect(() => {
    if (!scanId) return;
    const delay = setTimeout(() => {
      const src = new EventSource(`http://localhost:3001/api/agents/${scanId}/logs`);
      src.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[agent-log]', data);
          if (data.type === 'done') { setAgentDone(true); src.close(); return; }
          if (data.type === 'json' && data.data?.type === 'text' && data.data.part?.text) {
            const text = data.data.part.text;
            // Helper: check for SCORE pattern and extract it
            const extractScore = (t) => {
              const m = t.match(/\*{0,2}SCORE\s*:?\s*(\d+)\*{0,2}/i);
              if (m) {
                setAgentScore(parseInt(m[1], 10));
                return t.replace(/\n?[^\n]*\*{0,2}SCORE\s*:?\s*\d+\*{0,2}[^\n]*/i, '').trim();
              }
              return t;
            };

            // Check if this chunk contains SUMMARY
            if (!summaryStartedRef.current && text.trim().toUpperCase().includes('SUMMARY')) {
              summaryStartedRef.current = true;
              setSummaryStarted(true);
              const idx = text.toUpperCase().indexOf('SUMMARY');
              const before = text.substring(0, idx).trim();
              const after = extractScore(text.substring(idx + 7).trim());
              if (before) setContainerLogs(prev => [...prev.slice(-200), before]);
              if (after) setSummaryTexts(prev => [...prev, after]);
            } else if (summaryStartedRef.current) {
              const cleaned = extractScore(text);
              if (cleaned) setSummaryTexts(prev => [...prev, cleaned]);
            } else {
              setContainerLogs(prev => [...prev.slice(-200), text]);
            }
          }
        } catch (e) { console.error('[agent-log] parse error', e); }
      };
      src.onerror = () => {};
      return () => src.close();
    }, 2000);
    return () => clearTimeout(delay);
  }, [scanId]);

  // Auto-scroll
  useEffect(() => { updatesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [agentUpdates]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [containerLogs]);
  // Typewriter effect for summary
  useEffect(() => {
    const fullText = summaryTexts.join('\n\n');
    if (fullText.length <= displayedSummary.length) return;
    const remaining = fullText.substring(displayedSummary.length);
    const chunkSize = Math.min(3, remaining.length);
    const timer = setTimeout(() => {
      setDisplayedSummary(fullText.substring(0, displayedSummary.length + chunkSize));
    }, 15);
    return () => clearTimeout(timer);
  }, [summaryTexts, displayedSummary]);

  useEffect(() => { summaryEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [displayedSummary]);

  const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
  const sortedFindings = [...findings].sort((a, b) => {
    return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
  });

  const severityCounts = {
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length
  };

  // Calculate security score (0-100)
  const totalWeighted = severityCounts.high * 10 + severityCounts.medium * 5 + severityCounts.low * 2 + severityCounts.info * 1;
  const maxPossible = findings.length * 10 || 1;
  const securityScore = Math.max(0, Math.round(100 - (totalWeighted / maxPossible) * 100));
  
  // Determine status
  const getStatus = () => {
    if (severityCounts.high > 0) return { label: 'Critical', class: 'status-critical', icon: '!' };
    if (severityCounts.medium > 0) return { label: 'Warning', class: 'status-warning', icon: '!' };
    if (severityCounts.low > 0 || severityCounts.info > 0) return { label: 'Caution', class: 'status-caution', icon: 'i' };
    return { label: 'Secure', class: 'status-secure', icon: '✓' };
  };
  const status = getStatus();

  return (
    <div className="scan-results-page">
      <div className="cursor-glow" aria-hidden="true" />
      <div className="scan-results-container">
        <div className="results-header">
          <div className="header-content">
            <h2>Security Scan Results</h2>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Score Bar */}
        <div className="score-bar-section">
          <div className="score-bar-header">
            <span className="score-bar-label">Resilience Score</span>
            {agentScore !== null && (
              <span className={`score-bar-value ${agentScore >= 70 ? 'good' : agentScore >= 40 ? 'moderate' : 'poor'}`}>
                {agentScore}%
              </span>
            )}
          </div>
          <div className="score-bar-track">
            <div
              className={`score-bar-fill ${agentScore !== null ? (agentScore >= 70 ? 'good' : agentScore >= 40 ? 'moderate' : 'poor') : ''}`}
              style={{ width: agentScore !== null ? `${agentScore}%` : '0%' }}
            />
          </div>
        </div>

        {/* Agent Panel — crossfades between Activity and Summary */}
        <div className="agent-panel">
          <h3>{summaryStarted ? 'Agent Summary' : 'Agent Activity'}</h3>
          <div className="agent-panel-body">
            {/* Activity layer */}
            <div className={`agent-panel-layer ${summaryStarted ? 'fade-out' : 'fade-in'}`}>
              <div className="agent-live-box">
                {containerLogs.length === 0 && !agentDone && (
                  <div className="agent-waiting">
                    <div className="agent-waiting-dot" />
                    Agent is thinking...
                  </div>
                )}
                {containerLogs.map((text, i) => (
                  <span key={i} className="agent-live-chunk">{text}{'\n\n'}</span>
                ))}
                {containerLogs.length > 0 && !summaryStarted && !agentDone && (
                  <span className="agent-thinking">Thinking...</span>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Summary layer */}
            <div className={`agent-panel-layer ${summaryStarted ? 'fade-in' : 'fade-out'}`}>
              <div className="agent-summary-box">
                <div className="agent-summary-text">
                  {displayedSummary.split(/\*\*(.+?)\*\*/g).map((part, j) =>
                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                  )}
                  {displayedSummary.length < summaryTexts.join('\n\n').length && (
                    <span className="typewriter-cursor">|</span>
                  )}
                </div>
                <div ref={summaryEndRef} />
              </div>
            </div>
          </div>
        </div>

        {/* Agent Updates (fixed-height timeline log) */}
        <div className="agent-updates-section">
          <h3>Agent Updates {agentDone && <span className="agent-done-tag">Complete</span>}</h3>
          <div className="agent-updates-box">
            {agentUpdates.length === 0 && !agentDone && (
              <div className="agent-updates-waiting">
                <div className="agent-spinner" />
                <span>Waiting for agent updates...</span>
              </div>
            )}
            {agentUpdates.map((msg, i) => (
              <div key={i} className="agent-update-entry">
                <div className="agent-update-dot" />
                <div className="agent-update-content">
                  <span className="agent-update-time">{msg.time}</span>
                  <span className="agent-update-text">{msg.text}</span>
                </div>
              </div>
            ))}
            <div ref={updatesEndRef} />
          </div>
        </div>

        <div className="results-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={onNewScan}>
            New Scan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanResults;
