import { useEffect, useRef, useState } from 'react'
import './LandingPage.css'

function LandingPage({ onEnter }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  })
  const rafIdRef = useRef(0)

  // Apply theme to document
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  // Mouse glow effect
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

  return (
    <div className="landing-container">
      <div className="cursor-glow" aria-hidden="true" />
      <div className="top-left">
        <h1 className="app-title">Haven</h1>
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

      <div className="landing-content">
        <h1 className="landing-headline">
          Protecting the Software<br />That Protects People
        </h1>
        
        <p className="landing-description">
          In a world where humanitarian aid, education, healthcare, and crisis response 
          rely on open-source software, security is no longer optional — it's essential.
        </p>
        
        <p className="landing-description secondary">
          Our platform helps safeguard the digital tools powering nonprofits, 
          grassroots movements, and global relief efforts by automatically testing 
          and strengthening their code before it reaches those who need it most.
        </p>
        
        <div className="landing-tagline">
          <span>Scan.</span>
          <span>Secure.</span>
          <span>Serve.</span>
        </div>
        
        <button type="button" className="cta-button" onClick={onEnter}>
          Enter Haven
        </button>
      </div>
    </div>
  )
}

export default LandingPage
