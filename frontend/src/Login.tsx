import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import "./Login.css";

// Deliberately does NOT route to a separate onboarding page after auth --
// the app itself already has a contextual first-look walkthrough
// (FirstLookTour, in App.tsx) that spotlights real, live elements on the
// actual page. A generic wizard shown before the app exists just delays
// the thing the user came here for.
export function Login({ onLoggedIn, isDemo = false }: { onLoggedIn: () => void; isDemo?: boolean }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The backend sleeps after inactivity (Render free tier) and can take
  // 30-60s to wake on the first request. Most logins resolve in well under
  // a second, so this only appears once busy has actually dragged on --
  // it shouldn't flash for a normal fast login.
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (!busy) {
      setWaking(false);
      return;
    }
    const id = setTimeout(() => setWaking(true), 1500);
    return () => clearTimeout(id);
  }, [busy]);
  // React 18 StrictMode intentionally mounts effects twice in dev, which
  // fired two concurrent POST /api/auth/demo requests on every "Try the
  // demo" click -- one usually succeeded, but the race could leave the
  // page showing the manual login form instead of proceeding in (the
  // failing request's catch-block error could land after the successful
  // one's redirect). A ref survives StrictMode's extra mount/unmount
  // cycle (unlike state), so this guard makes the auto-trigger genuinely
  // run once, without blocking the "Explore the live demo" button below,
  // which calls the same handler on a real, single click.
  const autoDemoTriggered = useRef(false);

  useEffect(() => {
    if (isDemo && !autoDemoTriggered.current) {
      autoDemoTriggered.current = true;
      handleDemo();
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username.trim(), password, remember);
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

        {waking && !error && (
          <p className="login-waking" role="status">Waking up the server — this can take up to a minute on the first load…</p>
        )}
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
