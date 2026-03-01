import { useEffect, useRef } from 'react'
import './LandingPage.css'

// Force dark theme immediately
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = 'dark'
}

function LandingPage({ onEnter }) {
  const rafIdRef = useRef(0)

  // Also set in useEffect to be safe
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
  }, [])

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
