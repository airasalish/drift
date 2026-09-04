import type { WatchlistItem } from "./types";

// VITE_API_BASE lets the deployed frontend point at the deployed backend;
// falls back to local dev so `npm run dev` needs zero configuration.
const BASE = `${import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"}/api`;

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  list: () => fetch(`${BASE}/watchlist`).then((r) => handle<WatchlistItem[]>(r)),

  add: (symbol: string, note: string) =>
    fetch(`${BASE}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, note: note || null }),
    }).then((r) => handle<WatchlistItem>(r)),

  remove: (id: number) =>
    fetch(`${BASE}/watchlist/${id}`, { method: "DELETE" }).then((r) => handle(r)),

  markSeen: (id: number) =>
    fetch(`${BASE}/watchlist/${id}/seen`, { method: "POST" }).then((r) =>
      handle<WatchlistItem>(r)
    ),
};
