import './ScanResults.css';

const ScanResults = ({ results, onClose, onNewScan }) => {
  const { scanId, duration, scanResults } = results;
  const findings = scanResults?.findings || [];

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
      <div className="scan-results-container">
        <div className="results-header">
          <div className="header-content">
            <h2>Security Scan Results</h2>
            <span className={`status-badge ${status.class}`}>
              <span className="status-icon">{status.icon}</span>
              {status.label}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="results-summary">
          <div className="summary-card score-card">
            <h3>Security Score</h3>
            <div className="score-gauge">
              <div className="score-ring" style={{ '--score': securityScore }}>
                <span className="score-value">{securityScore}</span>
              </div>
            </div>
          </div>

          <div className="summary-card severity-breakdown">
            <h3>Severity Breakdown</h3>
            <div className="severity-bars">
              {severityCounts.high > 0 && (
                <div className="severity-bar">
                  <span className="severity-label high">High</span>
                  <div className="severity-progress">
                    <div className="severity-fill high" style={{ width: `${(severityCounts.high / findings.length) * 100}%` }} />
                  </div>
                  <span className="severity-count">{severityCounts.high}</span>
                </div>
              )}
              {severityCounts.medium > 0 && (
                <div className="severity-bar">
                  <span className="severity-label medium">Medium</span>
                  <div className="severity-progress">
                    <div className="severity-fill medium" style={{ width: `${(severityCounts.medium / findings.length) * 100}%` }} />
                  </div>
                  <span className="severity-count">{severityCounts.medium}</span>
                </div>
              )}
              {severityCounts.low > 0 && (
                <div className="severity-bar">
                  <span className="severity-label low">Low</span>
                  <div className="severity-progress">
                    <div className="severity-fill low" style={{ width: `${(severityCounts.low / findings.length) * 100}%` }} />
                  </div>
                  <span className="severity-count">{severityCounts.low}</span>
                </div>
              )}
              {severityCounts.info > 0 && (
                <div className="severity-bar">
                  <span className="severity-label info">Info</span>
                  <div className="severity-progress">
                    <div className="severity-fill info" style={{ width: `${(severityCounts.info / findings.length) * 100}%` }} />
                  </div>
                  <span className="severity-count">{severityCounts.info}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="findings-section">
          <h3>Findings ({findings.length})</h3>
          {sortedFindings.length === 0 ? (
            <div className="no-findings">
              <div className="no-findings-icon"></div>
              <p>No security issues found!</p>
            </div>
          ) : (
            <div className="findings-list">
              {sortedFindings.map((finding, idx) => (
                <div key={idx} className={`finding-card ${finding.severity}`}>
                  <div className="finding-header">
                    <span className={`finding-severity-badge ${finding.severity}`}>
                      {finding.severity}
                    </span>
                    <span className="finding-type">{finding.type}</span>
                  </div>
                  <h4 className="finding-title">{finding.title}</h4>
                  {finding.description && (
                    <p className="finding-description">{finding.description}</p>
                  )}
                  {finding.remediation && (
                    <div className="finding-remediation">
                      <span className="remediation-label">Fix:</span>
                      <span className="remediation-text">{finding.remediation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
