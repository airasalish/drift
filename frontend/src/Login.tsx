import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import "./Login.css";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setPulse((value) => (value + 1) % 3), 3200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authOpen) window.setTimeout(() => usernameRef.current?.focus(), 120);
  }, [authOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await api.signup(username.trim(), password, remember);
      else await api.login(username.trim(), password, remember);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemo() {
    setBusy(true);
    setError(null);
    try {
      await api.loginDemo();
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load the demo account");
    } finally {
      setBusy(false);
    }
  }

  const signalCopy = ["MARKETS MOVE.", "SIGNALS EMERGE.", "SO DO YOU."][pulse];

  function openAuth(nextMode: "login" | "signup" = "login") {
    setMode(nextMode);
    setAuthOpen(true);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="login-page">
      <div className="landing-hero" id="product">
        <div className="landing-art" aria-hidden="true" />
        <div className="landing-vignette" aria-hidden="true" />
        <div className="landing-grid" aria-hidden="true" />

        <header className="landing-nav">
          <button className="landing-wordmark" onClick={() => scrollTo("product")} aria-label="Back to top">DRIFT</button>
          <nav aria-label="Landing navigation">
            <button onClick={() => scrollTo("product")}>Product</button>
            <button onClick={() => scrollTo("features")}>Features</button>
            <button onClick={() => scrollTo("pricing")}>Pricing</button>
            <button className="nav-cta" onClick={() => openAuth("signup")}>Get started <span aria-hidden="true">↗</span></button>
          </nav>
        </header>

        <section className="hero-message" aria-label="Drift introduction">
          <p className="hero-kicker">{signalCopy}</p>
          <p className="hero-copy">Track stocks. Catch what matters.<br />Stay ahead.</p>
          <button className="hero-cta" onClick={() => openAuth("signup")}>Get started <span aria-hidden="true">→</span></button>
        </section>

        <div className="hero-signal" aria-label="Example market signal"><span>AAPL</span><strong>$232.41</strong><em>+2.46% ▲</em></div>
        <div className="hero-footer"><span>REAL DATA</span><i /> <span>REAL INSIGHTS</span><i /> <span>A BRIGHTER YOU</span></div>
        <button className="hero-scroll" onClick={() => scrollTo("features")}><span /> SCROLL</button>
      </div>

      <section className="landing-info" id="features">
        <div className="info-intro"><p className="section-kicker">WHY DRIFT</p><h2>Less noise.<br /><span>More signal.</span></h2><p>Drift is built around the question a normal watchlist ignores: what actually changed since you last looked?</p></div>
        <div className="feature-grid"><article><b>01</b><h3>Meaningful movement</h3><p>Volatility-aware rules surface moves that are unusual for that stock—not every tiny tick.</p></article><article><b>02</b><h3>Context, remembered</h3><p>Your last-view baseline persists, so returning to Drift feels like picking up a conversation.</p></article><article><b>03</b><h3>Explainable by design</h3><p>Every signal maps to a real number you can inspect, question, and defend.</p></article></div>
      </section>

      <section className="landing-pricing" id="pricing"><div><p className="section-kicker">PRICING</p><h2>Start with the<br /><span>signal.</span></h2></div><div className="pricing-card"><span>DRIFT / PERSONAL</span><strong>Free while in beta</strong><p>Watchlists, real market context, and a calmer way to return to your decisions.</p><button onClick={() => openAuth("signup")}>Create your account <span>↗</span></button></div></section>

      {authOpen && (
        <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
          <section className="login-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" onClick={() => setAuthOpen(false)} aria-label="Close sign in">×</button>
            <div className="login-card-topline"><span>DRIFT</span><span>ACCESS / {mode === "login" ? "01" : "02"}</span></div>
            <h1 id="auth-title">Track what moves you.</h1>
            <p className="tagline">A calmer watchlist for the changes worth your attention.</p>
            <form onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="username">Username</label>
              <input ref={usernameRef} id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" disabled={busy} autoComplete="username" />
              <label className="field-label" htmlFor="password">Password</label>
              <input id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type="password" disabled={busy} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              <label className="login-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay logged in on this device</label>
              <button type="submit" className="login-submit" disabled={busy || !username.trim() || !password}><span>{busy ? "Connecting…" : mode === "signup" ? "Create account" : "Enter Drift"}</span><span aria-hidden="true">↗</span></button>
            </form>
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="login-links"><button type="button" className="login-mode-toggle" onClick={() => setMode(mode === "signup" ? "login" : "signup")} disabled={busy}>{mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}</button><span className="login-divider">or</span><button type="button" className="login-demo-btn" onClick={handleDemo} disabled={busy}>Explore the live demo <span aria-hidden="true">→</span></button></div>
            <p className="login-footnote">No brokerage connection. No trading. Just a sharper way to notice.</p>
          </section>
        </div>
      )}
    </main>
  );
}
