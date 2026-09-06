import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import "./Landing.css";

export function Landing() {
  const navigate = useNavigate();
  const [investorGoal, setInvestorGoal] = useState("");
  const [reviewCadence, setReviewCadence] = useState("");
  const questionnaireComplete = investorGoal !== "" && reviewCadence !== "";

  return (
    <div className="landing">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-brand">
            <BrandMark />
            <span>Drift</span>
          </div>
          <nav className="landing-nav">
            <button onClick={() => navigate("/login")} className="nav-btn">Log in</button>
            <button onClick={() => navigate("/signup")} className="nav-btn primary">Sign up</button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-container">
          <h1>Not just prices.</h1>
          <h1 style={{ color: "var(--accent)" }}>What actually drifted since you last looked.</h1>
          <p className="hero-subtitle">
            Your watchlist remembers. Drift notices what changed. You focus on what matters.
          </p>
          <button onClick={() => navigate("/demo")} className="cta-btn demo">
            Try the demo
          </button>
          <button onClick={() => navigate("/signup")} className="cta-btn signup">
            Create an account
          </button>
        </div>
      </section>

      {/* Problem */}
      <section className="landing-section problem">
        <div className="landing-container">
          <h2>The problem with most watchlists</h2>
          <div className="problem-grid">
            <div className="problem-card">
              <div className="icon" aria-hidden="true">01</div>
              <h3>Too much noise</h3>
              <p>Every price move gets flagged. You end up ignoring everything.</p>
            </div>
            <div className="problem-card">
              <div className="icon" aria-hidden="true">02</div>
              <h3>Forgetting context</h3>
              <p>Was this stock always volatile? Did it really change? You have to remember.</p>
            </div>
            <div className="problem-card">
              <div className="icon" aria-hidden="true">03</div>
              <h3>No narrative</h3>
              <p>You get a number. You don't get *why* it matters.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="landing-section solution">
        <div className="landing-container">
          <h2>How Drift works</h2>
          <div className="solution-grid">
            <div className="solution-card">
              <div className="step">1</div>
              <h3>You visit your watchlist</h3>
              <p>Drift remembers the exact time you last looked and the price at that moment.</p>
            </div>
            <div className="solution-card">
              <div className="step">2</div>
              <h3>Rules decide what changed</h3>
              <p>Not "did it move" — but "did it move *unusually* compared to itself, your other stocks, and the market?"</p>
            </div>
            <div className="solution-card">
              <div className="step">3</div>
              <h3>You see what matters</h3>
              <p>Only the stocks that actually changed significantly bubble up. Drift filters the noise.</p>
            </div>
            <div className="solution-card">
              <div className="step">4</div>
              <h3>Drifty explains</h3>
              <p>For each flagged stock, you get the actual evidence: "2.1× your normal daily move, and volume is up 3×."</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section features">
        <div className="landing-container">
          <h2>Built for serious investors</h2>
          <div className="features-list">
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">01</div>
              <div>
                <h4>Volatility-adjusted rules</h4>
                <p>A 2% move means different things for different stocks. Drift knows the difference.</p>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">02</div>
              <div>
                <h4>Drifty intelligence</h4>
                <p>Compare a stock against itself, your watchlist, and the market. Get ranked by what deserves attention.</p>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">03</div>
              <div>
                <h4>Account-based persistence</h4>
                <p>Your watchlists and "since you last looked" state follow you across devices.</p>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">04</div>
              <div>
                <h4>Multiple watchlists</h4>
                <p>Organize by strategy, sector, or time horizon. Stocks can belong to multiple watchlists.</p>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">05</div>
              <div>
                <h4>Real-time market data</h4>
                <p>Powered by live market data. Refreshed every 60 seconds.</p>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon" aria-hidden="true">06</div>
              <div>
                <h4>Transparent rules</h4>
                <p>No black box. Every signal is explainable. You know exactly why something was flagged.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="landing-section rules">
        <div className="landing-container">
          <h2>The rules that matter</h2>
          <p className="rules-intro">
            A stock gets flagged if any of these fire:
          </p>
          <div className="rules-grid">
            <div className="rule">
              <h4>Abnormal price move</h4>
              <p>Stock moves 1.5× its normal daily volatility since your last visit.</p>
              <div className="example">Example: AAPL usually moves ±1.2% daily. A -2.5% move today gets flagged.</div>
            </div>
            <div className="rule">
              <h4>Volume spike</h4>
              <p>Trading volume is 2× the 20-day average.</p>
              <div className="example">Example: Typical volume 40M shares, today 85M+ shares traded.</div>
            </div>
            <div className="rule">
              <h4>52-week high/low</h4>
              <p>Stock crosses a 52-week extreme or comes within 3% of one.</p>
              <div className="example">Example: TSLA hits a new 52-week high, or comes within 3% of one.</div>
            </div>
            <div className="rule">
              <h4>Portfolio-level signal</h4>
              <p>3+ stocks move &gt;2% in the same direction on the same day.</p>
              <div className="example">Example: Your tech stocks all down 2%+ — not an isolated move.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Questionnaires */}
      <section className="landing-section questionnaires" id="questionnaire">
        <div className="landing-container">
          <div className="questionnaire-heading">
            <span className="section-eyebrow">A better first watchlist</span>
            <h2>Tell Drift what deserves your attention.</h2>
            <p>Two quick questions help you start with a watchlist that matches how you invest.</p>
          </div>
          <div className="questionnaire-grid">
            <fieldset className="question-card">
              <legend><span>01</span> What are you watching for?</legend>
              <p className="question-help">Choose the signal you want to notice first.</p>
              <div className="answer-list">
                {[
                  ["long-term", "Long-term conviction", "Business progress and meaningful changes"],
                  ["opportunity", "New opportunities", "Unusual moves worth researching"],
                  ["portfolio", "Portfolio balance", "How my positions move together"],
                ].map(([value, label, detail]) => (
                  <label className={`answer-option ${investorGoal === value ? "selected" : ""}`} key={value}>
                    <input type="radio" name="investor-goal" value={value} checked={investorGoal === value} onChange={(event) => setInvestorGoal(event.target.value)} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="question-card">
              <legend><span>02</span> How often do you review?</legend>
              <p className="question-help">Drift compares the market to your last real visit.</p>
              <div className="answer-list">
                {[
                  ["daily", "Most trading days", "Give me a focused daily read"],
                  ["weekly", "A few times a week", "Show me what changed since I checked"],
                  ["sometimes", "When something feels off", "Surface only the unusual signals"],
                ].map(([value, label, detail]) => (
                  <label className={`answer-option ${reviewCadence === value ? "selected" : ""}`} key={value}>
                    <input type="radio" name="review-cadence" value={value} checked={reviewCadence === value} onChange={(event) => setReviewCadence(event.target.value)} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="questionnaire-result" aria-live="polite">
            <div>
              <span className="result-kicker">YOUR STARTING POINT</span>
              <strong>{questionnaireComplete ? "Your watchlist can stay quiet until something meaningful changes." : "Answer both questions to shape your starting point."}</strong>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => navigate("/signup")} disabled={!questionnaireComplete}>Build my watchlist</button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section cta-final">
        <div className="landing-container">
          <h2>Ready to focus on what actually changed?</h2>
          <div className="cta-buttons">
            <button onClick={() => navigate("/demo")} className="btn btn-outline">
              Try the demo first
            </button>
            <button onClick={() => navigate("/signup")} className="btn btn-primary">
              Create your watchlist
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-content">
            <div>
              <h4>Drift</h4>
              <p>A smarter market watchlist.</p>
            </div>
            <div>
              <h4>Links</h4>
              <nav className="footer-nav">
                <a href="#about">About</a>
                <a href="/signup">Get started</a>
              </nav>
            </div>
          </div>
          <div className="footer-bottom">
            <p>Built for serious investors who care about signal over noise.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
