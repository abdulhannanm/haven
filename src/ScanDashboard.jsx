import { useState, useEffect } from 'react';
import './ScanDashboard.css';

const ScanDashboard = ({ scanId }) => {
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  const steps = [
    { id: 'clone', label: 'Cloning repository...' },
    { id: 'build', label: 'Building container...' },
    { id: 'run', label: 'Starting container...' },
    { id: 'detect', label: 'Detecting port...' },
    { id: 'scan', label: 'Security scanning...' },
    { id: 'cleanup', label: 'Cleaning up...' }
  ];

  const stepIndex = {
    clone: 0,
    build: 1,
    run: 2,
    detect: 3,
    scan: 4,
    cleanup: 5
  };

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

  return (
    <div className="scan-dashboard">
      <div className="progress-label">{currentStep}</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="scan-meta">{Math.round(progress)}%</div>
    </div>
  );
};

export default ScanDashboard;
