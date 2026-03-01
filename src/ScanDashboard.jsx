import { useState, useEffect, useRef } from 'react';
import './ScanDashboard.css';

const ScanDashboard = ({ scanId }) => {
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [agentMessages, setAgentMessages] = useState([]);
  const logEndRef = useRef(null);

  const steps = [
    { id: 'clone', label: 'Cloning repository...' },
    { id: 'build', label: 'Building containers...' },
    { id: 'run', label: 'Starting containers...' },
    { id: 'detect', label: 'Waiting for app...' },
    { id: 'scan', label: 'Running load agent...' }
  ];

  const stepIndex = {
    clone: 0,
    build: 1,
    run: 2,
    detect: 3,
    scan: 4
  };

  // Scan progress SSE
  useEffect(() => {
    if (!scanId) return;

    const eventSource = new EventSource(`http://localhost:3001/api/scan/${scanId}/progress`);

    eventSource.onmessage = (event) => {
      if (event.data.startsWith(':heartbeat')) return;
      
      try {
        const data = JSON.parse(event.data);
        if (data.step && data.status === 'started') {
          const step = steps[stepIndex[data.step]];
          if (step) {
            setCurrentStep(step.label);
            setProgress(((stepIndex[data.step] + 1) / steps.length) * 100);
          }
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = () => {};

    return () => {
      eventSource.close();
    };
  }, [scanId]);

  // Agent updates SSE
  useEffect(() => {
    if (!scanId) return;

    const agentSource = new EventSource(`http://localhost:3001/api/agents/${scanId}/stream`);

    agentSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setAgentMessages(prev => [...prev, {
            text: data.message,
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString()
          }]);
        }
      } catch (error) {}
    };

    agentSource.onerror = () => {};

    return () => {
      agentSource.close();
    };
  }, [scanId]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  return (
    <div className="scan-dashboard">
      <div className="progress-label">{currentStep}</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="scan-meta">{Math.round(progress)}%</div>

      {agentMessages.length > 0 && (
        <div className="agent-log">
          <div className="agent-log-title">Agent Updates</div>
          <div className="agent-log-messages">
            {agentMessages.map((msg, i) => (
              <div key={i} className="agent-log-entry">
                <span className="agent-log-time">{msg.time}</span>
                <span className="agent-log-text">{msg.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanDashboard;
