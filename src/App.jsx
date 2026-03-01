import { useEffect, useRef, useState } from 'react'
import LandingPage from './LandingPage.jsx'
import ScanDashboard from './ScanDashboard.jsx'
import ScanResults from './ScanResults.jsx'
import './App.css'

function App() {
  const [githubUrl, setGithubUrl] = useState('')
  const [theme, setTheme] = useState('light')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scanResults, setScanResults] = useState(null)
  const [showMainApp, setShowMainApp] = useState(false)
  const [currentScanId, setCurrentScanId] = useState(null)
  const rafIdRef = useRef(0)

  const handleSubmit = async () => {
    if (!githubUrl.trim()) return
    
    setLoading(true)
    setError('')
    setScanResults(null)
    
    // Generate scan ID immediately so dashboard shows
    const newScanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setCurrentScanId(newScanId)
    
    try {
      const response = await fetch('http://localhost:3001/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubUrl, scanId: newScanId })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Scan failed')
      }
      
      setScanResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      // Keep dashboard visible for 22 seconds to let all steps animate
      setTimeout(() => {
        setLoading(false)
      }, 22000)
    }
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
      return
    }
    
    // Default to light theme
    setTheme('light')
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) return

    const handleMove = (e) => {
      const x = e.clientX
      const y = e.clientY

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--mx', `${x}px`)
        document.documentElement.style.setProperty('--my', `${y}px`)
      })
    }

    window.addEventListener('mousemove', handleMove)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  if (!showMainApp) {
    return <LandingPage onEnter={() => {
      setShowMainApp(true)
      // Reset to light theme when entering main app
      setTheme('light')
      document.documentElement.dataset.theme = 'light'
    }} />
  }

  return (
    <div className="search-container">
      <div className="cursor-glow" aria-hidden="true" />

      <div className="top-left">
        <h1 className="app-title" onClick={() => setShowMainApp(false)} style={{ cursor: 'pointer' }}>Haven</h1>
      </div>

      <div className="top-right">
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          aria-label="Toggle light/dark mode"
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
      </div>

      <div className={`scan-container ${loading ? 'scanning-active' : ''}`}>
        <div className="search-wrapper">
          <input
            type="text"
            className={`search-bar ${loading ? 'loading' : ''}`}
            placeholder="Enter GitHub URL"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit()
              }
            }}
            disabled={loading}
          />
          {loading && <div className="search-spinner" />}
          <button type="button" className="submit-button" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>
        
        {loading && currentScanId && (
          <ScanDashboard 
            scanId={currentScanId} 
            repoUrl={githubUrl}
          />
        )}
      </div>
      
      {error && (
        <div className="notification error">
          <div className="notification-icon">⚠️</div>
          <div className="notification-content">
            <div className="notification-title">Scan Failed</div>
            <div className="notification-message">{error}</div>
          </div>
          <button 
            className="notification-close" 
            onClick={() => setError('')}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}
      
      {scanResults && scanResults.success && (
        <ScanResults
          results={scanResults}
          onClose={() => setScanResults(null)}
          onNewScan={() => {
            setScanResults(null)
            setGithubUrl('')
            setCurrentScanId(null)
          }}
        />
      )}
    </div>
  )
}

export default App

