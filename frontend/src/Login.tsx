import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import "./Login.css";

export function Login({ onLoggedIn, isDemo = false }: { onLoggedIn: () => void; isDemo?: boolean }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (isDemo) {
      handleDemo();
    }
    const interval = window.setInterval(() => setPulse((value) => (value + 1) % 3), 3200);
    return () => window.clearInterval(interval);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username.trim(), password, remember);
      onLoggedIn();
      navigate("/onboarding");
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
      navigate("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load the demo account");
    } finally {
      setBusy(false);
    }
  }

  const signalCopy = "Markets move. So do you.";

  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true" />
      <div className="login-vignette" aria-hidden="true" />
      <div className="login-grid" aria-hidden="true" />

      <section className="landing-copy" aria-label="Drift introduction">
        <div className="landing-kicker"><span className="landing-live-dot" /> MARKET INTELLIGENCE / 01</div>
        <p className="landing-title">{signalCopy}</p>
        <p className="landing-description">Drift remembers where you were, then brings the meaningful moves back into focus.</p>
        <div className="landing-metrics">
          <span><strong>01</strong> change engine</span>
          <span><strong>24/7</strong> context</span>
          <span><strong>0</strong> noise alerts</span>
        </div>
      </section>

      <section className="login-card" aria-label="Sign in to Drift">
        <div className="login-card-topline"><span className="login-brand"><img src="/drift-d-mark.png" alt="" aria-hidden="true" /> DRIFT</span><span>ACCESS / 01</span></div>
        <h1>Welcome back.</h1>
        <p className="tagline">Log in to your watchlist and see what changed.</p>

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="username">Username</label>
          <input id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your username" disabled={busy} autoComplete="username" minLength={2} maxLength={40} required />
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type="password" disabled={busy} autoComplete="current-password" minLength={6} required />
          <label className="login-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay logged in on this device</label>
          <button type="submit" className="login-submit" disabled={busy || !username.trim() || !password}>
            <span>{busy ? "Connecting…" : "Enter Drift"}</span><span aria-hidden="true">↗</span>
          </button>
        </form>

        {error && <p className="login-error" role="alert">{error}</p>}

        <div className="login-links">
          <button type="button" className="login-mode-toggle" onClick={() => navigate("/signup")} disabled={busy}>
            New here? Create an account
          </button>
          <span className="login-divider">or</span>
          <button type="button" className="login-demo-btn" onClick={handleDemo} disabled={busy}>Explore the live demo <span aria-hidden="true">→</span></button>
        </div>
        <p className="login-footnote">No brokerage connection. No trading. Just a sharper way to notice.</p>
      </section>

      <div className="landing-scroll" aria-hidden="true"><span /> SCROLL TO EXPLORE</div>
    </main>
  );
}
