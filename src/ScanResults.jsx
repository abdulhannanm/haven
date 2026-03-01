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

  return (
    <div className="scan-results-page">
      <div className="scan-results-container">
        <div className="results-header">
          <h2>Security Scan Results</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="results-summary">
          <div className="summary-card scan-info">
            <div className="info-row">
              <span className="info-label">Scan ID:</span>
              <span className="info-value">{scanId}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Duration:</span>
              <span className="info-value">{duration}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Total Findings:</span>
              <span className="info-value">{findings.length}</span>
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
              <div className="no-findings-icon">✅</div>
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
