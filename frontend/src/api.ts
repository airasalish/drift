import type { HistoryEvent, Watchlist, WatchlistItem } from "./types";

// VITE_API_BASE lets the deployed frontend point at the deployed backend;
// falls back to local dev so `npm run dev` needs zero configuration.
const BASE = `${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"}/api`;

const TOKEN_KEY = "drift_token";
const USERNAME_KEY = "drift_username";
const ACTIVE_WATCHLIST_KEY = "drift_active_watchlist";

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

export function getActiveWatchlistId(): number | null {
  const stored = localStorage.getItem(ACTIVE_WATCHLIST_KEY);
  return stored ? parseInt(stored, 10) : null;
}

export function setActiveWatchlistId(id: number | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_WATCHLIST_KEY);
  } else {
    localStorage.setItem(ACTIVE_WATCHLIST_KEY, id.toString());
  }
}

function setSession(token: string, username: string, remember: boolean) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USERNAME_KEY, username);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ACTIVE_WATCHLIST_KEY);
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

export interface ChartRangeOut {
  symbol: string;
  range: string;
  dates: string[];
  closes: number[];
  opens: number[] | null;
  highs: number[] | null;
  lows: number[] | null;
  volumes: number[] | null;
  currency: string | null;
}

export interface SelfAnalysisOut {
  today_pct_change: number;
  normal_daily_move: number;
  move_magnitude: string;
  volume_vs_normal: number;
  context: string;
}

export interface PeerAnalysisOut {
  watchlist_size: number;
  same_direction_count: number;
  avg_peer_move: number;
  comparison: string;
  cluster: { name: string; symbols: string[]; trend: string } | null;
}

export interface MarketAnalysisOut {
  benchmark_move: number;
  outperformance: number;
  context: string;
}

export interface DriftyOut {
  symbol: string;
  attention_score: number;
  self_analysis: SelfAnalysisOut;
  peer_analysis: PeerAnalysisOut;
  market_analysis: MarketAnalysisOut;
  why_interesting: string[];
}

export interface DriftyRankedItem {
  symbol: string;
  attention_score: number;
  why: string;
}

export interface DriftyWatchlistOut {
  watchlist_id: number;
  total_items: number;
  items_needing_attention: number;
  ranked: DriftyRankedItem[];
}

export interface StockMembershipOut {
  symbol: string;
  company_name: string | null;
  memberships: { watchlist_id: number; name: string }[];
}

export const api = {
  // Existing single-watchlist routes (unchanged for backward compatibility)
  // These resolve to the user's default watchlist
  list: () => fetch(`${BASE}/watchlist`, { headers: authHeaders() }).then((r) => handle<WatchlistItem[]>(r)),

  add: (symbol: string, note: string, companyName?: string) =>
    fetch(`${BASE}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ symbol, note: note || null, company_name: companyName || null }),
    }).then((r) => handle<WatchlistItem>(r)),

  remove: (id: number) =>
    fetch(`${BASE}/watchlist/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => handle(r)),

  resetToSample: () =>
    fetch(`${BASE}/watchlist/reset`, { method: "POST", headers: authHeaders() }).then((r) =>
      handle<WatchlistItem[]>(r)
    ),

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

  digest: (symbol?: string) =>
    fetch(`${BASE}/watchlist/digest${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => handle<{ digest: string | null }>(r)),

  benchmark: () =>
    fetch(`${BASE}/watchlist/benchmark`, { headers: authHeaders() }).then((r) => handle<BenchmarkOut>(r)),

  history: () =>
    fetch(`${BASE}/watchlist/history`, { headers: authHeaders() }).then((r) => handle<HistoryEvent[]>(r)),

  // New multi-watchlist-aware routes
  watchlists: {
    list: () => fetch(`${BASE}/watchlists`, { headers: authHeaders() }).then((r) => handle<Watchlist[]>(r)),

    create: (name: string) =>
      fetch(`${BASE}/watchlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name }),
      }).then((r) => handle<Watchlist>(r)),

    rename: (id: number, name: string) =>
      fetch(`${BASE}/watchlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name }),
      }).then((r) => handle<Watchlist>(r)),

    delete: (id: number) =>
      fetch(`${BASE}/watchlists/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => handle(r)),

    // Item operations scoped to a specific watchlist
    listItems: (watchlistId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/items`, { headers: authHeaders() }).then((r) => handle<WatchlistItem[]>(r)),

    addItem: (watchlistId: number, symbol: string, note: string, companyName?: string) =>
      fetch(`${BASE}/watchlists/${watchlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ symbol, note: note || null, company_name: companyName || null }),
      }).then((r) => handle<WatchlistItem>(r)),

    removeItem: (watchlistId: number, itemId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/items/${itemId}`, { method: "DELETE", headers: authHeaders() }).then((r) => handle(r)),

    markSeenItem: (watchlistId: number, itemId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/items/${itemId}/seen`, { method: "POST", headers: authHeaders() }).then((r) =>
        handle<WatchlistItem>(r)
      ),

    updateItemNote: (watchlistId: number, itemId: number, note: string) =>
      fetch(`${BASE}/watchlists/${watchlistId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ note: note || null }),
      }).then((r) => handle<WatchlistItem>(r)),

    digest: (watchlistId: number, symbol?: string) =>
      fetch(`${BASE}/watchlists/${watchlistId}/digest${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, {
        headers: authHeaders(),
      }).then((r) => handle<{ digest: string | null }>(r)),

    benchmark: (watchlistId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/benchmark`, { headers: authHeaders() }).then((r) => handle<BenchmarkOut>(r)),

    history: (watchlistId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/history`, { headers: authHeaders() }).then((r) => handle<HistoryEvent[]>(r)),

    resetToSample: (watchlistId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/reset`, { method: "POST", headers: authHeaders() }).then((r) =>
        handle<WatchlistItem[]>(r)
      ),

    chart: (symbol: string, rangeName: string) =>
      fetch(`${BASE}/watchlists/chart/${encodeURIComponent(symbol)}/${rangeName}`, { headers: authHeaders() }).then((r) =>
        handle<ChartRangeOut>(r)
      ),

    drifty: (watchlistId: number, symbol: string) =>
      fetch(`${BASE}/watchlists/${watchlistId}/stock/${encodeURIComponent(symbol)}/drifty`, { headers: authHeaders() }).then((r) =>
        handle<DriftyOut>(r)
      ),

    driftyRanked: (watchlistId: number) =>
      fetch(`${BASE}/watchlists/${watchlistId}/drifty`, { headers: authHeaders() }).then((r) =>
        handle<DriftyWatchlistOut>(r)
      ),

    memberships: (symbol: string) =>
      fetch(`${BASE}/watchlists/stock/${encodeURIComponent(symbol)}/memberships`, { headers: authHeaders() }).then((r) =>
        handle<StockMembershipOut>(r)
      ),
  },

  // Shared routes (not watchlist-scoped)
  searchSymbols: (q: string) =>
    fetch(`${BASE}/symbols/search?q=${encodeURIComponent(q)}`).then((r) =>
      handle<{ results: SymbolSearchResult[] }>(r)
    ),

  markSeenBeacon: (id: number, watchlistId?: number) => {
    const token = getToken();
    if (navigator.sendBeacon && token) {
      const endpoint = watchlistId 
        ? `${BASE}/watchlists/${watchlistId}/items/${id}/seen?token=${encodeURIComponent(token)}`
        : `${BASE}/watchlist/${id}/seen?token=${encodeURIComponent(token)}`;
      navigator.sendBeacon(endpoint);
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
    try {
      sessionStorage.setItem("drift_pending_tour", "1");
    } catch {
      // private mode -- tour just won't auto-start
    }
    return data;
  },
};
