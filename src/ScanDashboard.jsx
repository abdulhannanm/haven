import { useState, useEffect, useRef } from 'react';
import './ScanDashboard.css';

const ScanDashboard = ({ scanId }) => {
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [mainUpdates, setMainUpdates] = useState([]);
  const [containerLogs, setContainerLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [agentDone, setAgentDone] = useState(false);
  const mainEndRef = useRef(null);
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
        if (data.step === 'scan' && data.status === 'completed') {
          setProgress(100);
          setCurrentStep('Agent running...');
        }
      } catch (error) {}
    };

    eventSource.onerror = () => {};
    return () => eventSource.close();
  }, [scanId]);

  // Main agent updates SSE (from post_update tool)
  useEffect(() => {
    if (!scanId) return;

    const agentSource = new EventSource(`http://localhost:3001/api/agents/${scanId}/stream`);

    agentSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setMainUpdates(prev => [...prev, {
            text: data.message,
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString()
          }]);
        }
      } catch (error) {}
    };

    agentSource.onerror = () => {};
    return () => agentSource.close();
  }, [scanId]);

  // Container logs SSE (docker logs from agent container)
  useEffect(() => {
    if (!scanId) return;

    // Delay slightly to let container start
    const timeout = setTimeout(() => {
      const logSource = new EventSource(`http://localhost:3001/api/agents/${scanId}/logs`);

      logSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'done') {
            setAgentDone(true);
            logSource.close();
            return;
          }

          let entry = null;
          if (data.type === 'json' && data.data) {
            const d = data.data;
            if (d.type === 'text' && d.part?.text) {
              entry = { kind: 'text', text: d.part.text, time: new Date(d.timestamp).toLocaleTimeString() };
            } else if (d.type === 'tool_call') {
              entry = { kind: 'tool', text: `Tool: ${d.part?.name || 'unknown'}`, time: new Date(d.timestamp).toLocaleTimeString() };
            } else if (d.type === 'tool_result') {
              entry = { kind: 'tool-result', text: `Tool result`, time: new Date(d.timestamp).toLocaleTimeString() };
            } else if (d.type === 'step_start') {
              entry = { kind: 'step', text: 'New step started', time: new Date(d.timestamp).toLocaleTimeString() };
            } else if (d.type === 'step_finish') {
              const cost = d.part?.cost ? `$${d.part.cost.toFixed(4)}` : '';
              entry = { kind: 'step-done', text: `Step finished ${cost}`, time: new Date(d.timestamp).toLocaleTimeString() };
            } else if (d.type === 'error') {
              entry = { kind: 'error', text: d.error?.data?.message || 'Error', time: new Date(d.timestamp).toLocaleTimeString() };
            } else {
              entry = { kind: 'info', text: d.type || 'log', time: new Date(d.timestamp || Date.now()).toLocaleTimeString() };
            }
          } else if (data.type === 'text') {
            entry = { kind: 'info', text: data.text, time: new Date().toLocaleTimeString() };
          }

          if (entry) {
            setContainerLogs(prev => [...prev.slice(-200), entry]);
          }
        } catch (error) {}
      };

      logSource.onerror = () => {};
      return () => logSource.close();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [scanId]);

  // Auto-scroll
  useEffect(() => {
    mainEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mainUpdates]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [containerLogs]);

  return (
    <div className="scan-dashboard">
      <div className="progress-label">{currentStep}</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="scan-meta">{Math.round(progress)}%</div>

      {mainUpdates.length > 0 && (
        <div className="agent-main-updates">
          <div className="agent-section-title">Agent Findings</div>
          <div className="agent-main-list">
            {mainUpdates.map((msg, i) => (
              <div key={i} className="agent-main-card">
                <div className="agent-main-time">{msg.time}</div>
                <div className="agent-main-text">{msg.text}</div>
              </div>
            ))}
            <div ref={mainEndRef} />
          </div>
        </div>
      )}



    </div>
  );
};

export default ScanDashboard;
