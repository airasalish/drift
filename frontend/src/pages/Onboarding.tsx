import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Onboarding.css'

const STEPS = [
  {
    title: "Welcome to Drift",
    description: "Your market watchlist that remembers where you were and notices what actually changed.",
    visual: "👋",
    details: "No noise. No false alerts. Just the moves that matter.",
  },
  {
    title: "Drift remembers",
    description: "When you visit your watchlist, Drift anchors to the exact time you last looked.",
    visual: "📍",
    details: "Every comparison starts from YOUR last visit, not from yesterday's close.",
  },
  {
    title: "Rules detect change",
    description: "A stock is flagged only if it moves UNUSUALLY — compared to itself, your watchlist, and the market.",
    visual: "📊",
    details: "AAPL moving 2% is normal. MSFT moving 2% might be huge. Drift knows the difference.",
  },
  {
    title: "Drifty explains why",
    description: "For every flagged stock, you get the evidence: the actual numbers behind the signal.",
    visual: "🧠",
    details: "\"2.1× your normal daily move, and volume is up 3×\" — deterministic, transparent, auditable.",
  },
  {
    title: "Build your watchlist",
    description: "Add stocks manually, use pre-made templates, or import up to 50 at once.",
    visual: "📝",
    details: "Create multiple watchlists for different strategies. Stocks can belong to many.",
  },
  {
    title: "You're ready",
    description: "Start watching. Drift will handle the analysis.",
    visual: "🚀",
    details: "Add your first stock and see your watchlist come alive with intelligence.",
  },
]

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const current = STEPS[step]
  const isLastStep = step === STEPS.length - 1

  const handleNext = () => {
    if (isLastStep) {
      navigate('/')
    } else {
      setStep(step + 1)
    }
  }

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleSkip = () => {
    navigate('/')
  }

  return (
    <div className="onboarding">
      <div className="onboarding-container">
        {/* Progress bar */}
        <div className="onboarding-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <span className="progress-text">{step + 1} of {STEPS.length}</span>
        </div>

        {/* Content */}
        <div className="onboarding-content">
          <div className="onboarding-visual">{current.visual}</div>
          <h1>{current.title}</h1>
          <p className="onboarding-description">{current.description}</p>
          <p className="onboarding-details">{current.details}</p>
        </div>

        {/* Illustration based on step */}
        <div className="onboarding-illustration">
          {step === 0 && <StepZeroIllustration />}
          {step === 1 && <StepOneIllustration />}
          {step === 2 && <StepTwoIllustration />}
          {step === 3 && <StepThreeIllustration />}
          {step === 4 && <StepFourIllustration />}
          {step === 5 && <StepFiveIllustration />}
        </div>

        {/* Controls */}
        <div className="onboarding-controls">
          {step > 0 && (
            <button onClick={handlePrev} className="btn-secondary">← Back</button>
          )}

          <div className="flex-spacer" />

          <button onClick={handleSkip} className="btn-text">Skip tour</button>

          <button onClick={handleNext} className="btn-primary">
            {isLastStep ? 'Start tracking →' : 'Next →'}
          </button>
        </div>

        {/* Dots */}
        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`dot ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Simple illustrations for each step
function StepZeroIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <circle cx="100" cy="100" r="80" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <text x="100" y="110" textAnchor="middle" fontSize="48" dy=".3em">👋</text>
    </svg>
  )
}

function StepOneIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <line x1="20" y1="100" x2="180" y2="100" stroke="var(--border)" strokeWidth="2" />
      <circle cx="100" cy="100" r="8" fill="var(--accent)" />
      <text x="100" y="130" textAnchor="middle" fontSize="12" fill="var(--muted)">You are here</text>
    </svg>
  )
}

function StepTwoIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <rect x="20" y="40" width="30" height="120" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
      <rect x="60" y="50" width="30" height="110" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
      <rect x="100" y="60" width="30" height="100" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1" />
      <rect x="140" y="70" width="30" height="90" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
    </svg>
  )
}

function StepThreeIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <circle cx="60" cy="70" r="12" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="100" cy="100" r="12" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="140" cy="80" r="12" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="2" />
      <line x1="60" y1="70" x2="100" y2="100" stroke="var(--border)" strokeWidth="1" strokeDasharray="2,2" />
      <line x1="100" y1="100" x2="140" y2="80" stroke="var(--border)" strokeWidth="1" strokeDasharray="2,2" />
    </svg>
  )
}

function StepFourIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <rect x="30" y="30" width="140" height="140" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" rx="4" />
      <line x1="40" y1="50" x2="160" y2="50" stroke="var(--border)" strokeWidth="1" />
      <circle cx="45" cy="80" r="4" fill="var(--accent)" />
      <line x1="55" y1="75" x2="155" y2="75" stroke="var(--muted)" strokeWidth="1" />
      <line x1="55" y1="85" x2="155" y2="85" stroke="var(--muted)" strokeWidth="1" />
      <circle cx="45" cy="120" r="4" fill="var(--accent)" />
      <line x1="55" y1="115" x2="155" y2="115" stroke="var(--muted)" strokeWidth="1" />
      <line x1="55" y1="125" x2="155" y2="125" stroke="var(--muted)" strokeWidth="1" />
    </svg>
  )
}

function StepFiveIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="illustration">
      <circle cx="100" cy="100" r="60" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="100" cy="100" r="40" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
      <circle cx="100" cy="100" r="20" fill="var(--accent)" opacity="0.3" />
      <text x="100" y="110" textAnchor="middle" fontSize="36" dy=".3em">✓</text>
    </svg>
  )
}
