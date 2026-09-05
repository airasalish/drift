import type { WatchlistItem } from "./types";

// VITE_API_BASE lets the deployed frontend point at the deployed backend;
// falls back to local dev so `npm run dev` needs zero configuration.
const BASE = `${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"}/api`;

const TOKEN_KEY = "drift_token";
const USERNAME_KEY = "drift_username";

// "Remember me" controls WHERE the token lives, not whether it's saved at
// all: localStorage survives closing the browser, sessionStorage clears
// the moment the tab/browser closes. Both are checked on read so it
// doesn't matter which one a given login used.
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY) ?? sessionStorage.getItem(USERNAME_KEY);
}

function setSession(token: string, username: string, remember: boolean) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USERNAME_KEY, username);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USERNAME_KEY);
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // token is gone/expired server-side -- clear it so the app falls back
    // to the login screen instead of looping on 401s forever
    logout();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `request failed (${res.status})`);
  }
  return res.json();
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  list: () => fetch(`${BASE}/watchlist`, { headers: authHeaders() }).then((r) => handle<WatchlistItem[]>(r)),

  add: (symbol: string, note: string) =>
    fetch(`${BASE}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ symbol, note: note || null }),
    }).then((r) => handle<WatchlistItem>(r)),

  remove: (id: number) =>
    fetch(`${BASE}/watchlist/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => handle(r)),

  markSeen: (id: number) =>
    fetch(`${BASE}/watchlist/${id}/seen`, { method: "POST", headers: authHeaders() }).then((r) =>
      handle<WatchlistItem>(r)
    ),

  updateNote: (id: number, note: string) =>
    fetch(`${BASE}/watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ note: note || null }),
    }).then((r) => handle<WatchlistItem>(r)),

  // optional `symbol` narrows the digest to one stock (drawer's "Explain
  // this"); omitted, it summarizes the whole attention feed as before.
  digest: (symbol?: string) =>
    fetch(`${BASE}/watchlist/digest${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => handle<{ digest: string | null }>(r)),

  benchmark: () =>
    fetch(`${BASE}/watchlist/benchmark`, { headers: authHeaders() }).then((r) => handle<BenchmarkOut>(r)),

  searchSymbols: (q: string) =>
    // no auth needed -- search isn't user-specific data
    fetch(`${BASE}/symbols/search?q=${encodeURIComponent(q)}`).then((r) =>
      handle<{ results: SymbolSearchResult[] }>(r)
    ),

  // Fire-and-forget mark-seen for the "user is leaving" case (tab hidden /
  // closed). A normal fetch can get cancelled mid-flight when the page
  // unloads; sendBeacon is specifically designed to survive that -- but it
  // can't attach custom headers, so the token rides in the URL instead
  // (backend accepts either, see services/auth.py).
  markSeenBeacon: (id: number) => {
    const token = getToken();
    if (navigator.sendBeacon && token) {
      navigator.sendBeacon(`${BASE}/watchlist/${id}/seen?token=${encodeURIComponent(token)}`);
    }
  },

  signup: async (username: string, password: string, remember: boolean) => {
    const res = await fetch(`${BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await handle<{ token: string; username: string }>(res);
    setSession(data.token, data.username, remember);
    return data;
  },

  login: async (username: string, password: string, remember: boolean) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await handle<{ token: string; username: string }>(res);
    setSession(data.token, data.username, remember);
    return data;
  },

  loginDemo: async () => {
    const res = await fetch(`${BASE}/auth/demo`, { method: "POST" });
    const data = await handle<{ token: string; username: string }>(res);
    setSession(data.token, data.username, true);
    return data;
  },
};

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
}

export interface BenchmarkOut {
  benchmark_symbol: string;
  benchmark_label: string;
  benchmark_pct: number | null;
  watchlist_pct: number | null;
  outperformance_pct: number | null;
}
