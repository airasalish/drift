import { useState, type FormEvent } from "react";
import { api } from "./api";
import "./Login.css";

// Deliberately minimal/unstyled-ish -- functional first. Restyle freely,
// but keep all three paths (signup, login, demo) since each answers a
// different question: signup/login prove real per-user separation works,
// demo keeps the zero-friction "click the link, see it working" path that
// existed before auth was added.
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await api.signup(username.trim(), password, remember);
      } else {
        await api.login(username.trim(), password, remember);
      }
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

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Drift</h1>
        <p className="tagline">Not just prices — what actually drifted since you last looked.</p>

        <form onSubmit={handleSubmit}>
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            disabled={busy}
            autoComplete="username"
          />
          <input
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            disabled={busy}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <label className="login-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Stay logged in on this device
          </label>
          <button type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? "…" : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>

        {error && <p className="login-error">{error}</p>}

        <button
          type="button"
          className="login-mode-toggle"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          disabled={busy}
        >
          {mode === "signup" ? "Already have an account? Log in" : "New here? Sign up"}
        </button>

        <div className="login-divider">or</div>

        <button type="button" className="login-demo-btn" onClick={handleDemo} disabled={busy}>
          Try the demo (no account needed)
        </button>
      </div>
    </div>
  );
}
