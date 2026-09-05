import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import "./Login.css";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setPulse((value) => (value + 1) % 3), 3200);
    return () => window.clearInterval(interval);
  }, []);

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

  const signalCopy = ["Your market, with context.", "Notice what changed.", "Track the move that matters."][pulse];

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
        <div className="login-card-topline"><span className="login-brand"><img src="/drift-d-mark.png" alt="" aria-hidden="true" /> DRIFT</span><span>ACCESS / {mode === "login" ? "01" : "02"}</span></div>
        <h1>Track what moves you.</h1>
        <p className="tagline">A calmer watchlist for the changes worth your attention.</p>

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="username">Username</label>
          <input id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" disabled={busy} autoComplete="username" />
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type="password" disabled={busy} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          <label className="login-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay logged in on this device</label>
          <button type="submit" className="login-submit" disabled={busy || !username.trim() || !password}>
            <span>{busy ? "Connecting…" : mode === "signup" ? "Create account" : "Enter Drift"}</span><span aria-hidden="true">↗</span>
          </button>
        </form>

        {error && <p className="login-error" role="alert">{error}</p>}

        <div className="login-links">
          <button type="button" className="login-mode-toggle" onClick={() => setMode(mode === "signup" ? "login" : "signup")} disabled={busy}>
            {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
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
