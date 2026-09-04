import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { formatPct, formatPrice, formatRelative } from "./format";
import { Sparkline } from "./Sparkline";
import { SymbolInput } from "./SymbolInput";
import type { WatchlistItem } from "./types";
import "./App.css";

const REFRESH_MS = 15_000;

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const h = et.getHours();
  const m = et.getMinutes();
  const minOfDay = h * 60 + m;
  return day >= 1 && day <= 5 && minOfDay >= 570 && minOfDay < 960; // 9:30–16:00
}

function App() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [confirmRemove, setConfirmRemove] = useState<Record<number, boolean>>({});
  const itemsRef = useRef<WatchlistItem[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetCountdown() {
    setCountdown(REFRESH_MS / 1000);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_MS / 1000 : c - 1));
    }, 1000);
  }

  async function refresh() {
    try {
      const data = await api.list();
      setItems(data);
      itemsRef.current = data;
      setError(null);
      setDigest(null);
      setLastRefreshedAt(new Date());
      resetCountdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function handleExplain() {
    setDigestLoading(true);
    try {
      const { digest } = await api.digest();
      setDigest(digest ?? "Couldn't generate a summary right now — the details below still apply.");
    } catch {
      setDigest("Couldn't generate a summary right now — the details below still apply.");
    } finally {
      setDigestLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(id);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "hidden") return;
      for (const item of itemsRef.current) {
        if (item.last_viewed_at == null || item.has_attention) {
          api.markSeenBeacon(item.id);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.add(symbol.trim(), note.trim());
      setSymbol("");
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add symbol");
    } finally {
      setAdding(false);
    }
  }

  async function handleSeen(id: number) {
    await api.markSeen(id);
    refresh();
  }

  async function handleRemove(id: number) {
    setConfirmRemove((prev) => { const next = { ...prev }; delete next[id]; return next; });
    await api.remove(id);
    refresh();
  }

  function requestRemove(id: number) {
    setConfirmRemove((prev) => ({ ...prev, [id]: true }));
  }

  function cancelRemove(id: number) {
    setConfirmRemove((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  const attention = items.filter((i) => i.has_attention).sort((a, b) => b.attention_score - a.attention_score);
  const rest = items.filter((i) => !i.has_attention);
  const marketOpen = isMarketOpen();

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Drift</h1>
            <p className="tagline">Not just prices — what actually drifted since you last looked.</p>
          </div>
        </div>
        {!loading && items.length > 0 && (
          <div className="summary-pill" data-warn={attention.length > 0}>
            {attention.length === 0
              ? "All quiet"
              : `${attention.length} of ${items.length} need attention`}
          </div>
        )}
      </header>

      {!loading && (
        <div className="status-bar">
          <span className={`dot${error ? " stale" : ""}`} />
          {lastRefreshedAt
            ? `Updated ${formatRelative(lastRefreshedAt.toISOString())}`
            : "Loading…"}
          <span className="sep">·</span>
          {`Next in ${countdown}s`}
          {items.length > 0 && (
            <>
              <span className="sep">·</span>
              {`${items.length} stock${items.length !== 1 ? "s" : ""} tracked`}
            </>
          )}
          <span className="sep">·</span>
          <span style={{ color: marketOpen ? "var(--green)" : "var(--muted)" }}>
            {marketOpen ? "Market open" : "Market closed"}
          </span>
        </div>
      )}

      <form className="add-form" onSubmit={handleAdd}>
        <SymbolInput value={symbol} onChange={setSymbol} disabled={adding} />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are you watching this? (optional)"
          disabled={adding}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <div className="error-row">
          <div className="error">{error}</div>
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="skeleton-block" />
      ) : (
        <>
          <section>
            <div className="section-head">
              <h2>What changed since you last checked</h2>
              {attention.length > 0 && (
                <button className="explain-btn" onClick={handleExplain} disabled={digestLoading}>
                  {digestLoading ? "Summarizing…" : "Explain this"}
                </button>
              )}
            </div>
            {digest && <p className="digest">{digest}</p>}
            {attention.length === 0 ? (
              <div className="empty-box">✓ All clear — nothing moved meaningfully since you last checked.</div>
            ) : (
              <div className="cards">
                {attention.map((item) => (
                  <AttentionCard
                    key={item.id}
                    item={item}
                    onSeen={handleSeen}
                    onRemove={handleRemove}
                    requestRemove={requestRemove}
                    cancelRemove={cancelRemove}
                    confirming={!!confirmRemove[item.id]}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2>Your watchlist</h2>
            {items.length === 0 ? (
              <div className="empty-box">Nothing on your watchlist yet — add a symbol above.</div>
            ) : (
              <div className="table-scroll">
                <table className="watchlist-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Price</th>
                      <th>Trend (30d)</th>
                      <th>Signal</th>
                      <th>Since added</th>
                      <th>Since last view</th>
                      <th>Freshness</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...attention, ...rest].map((item) => (
                      <Row
                        key={item.id}
                        item={item}
                        onSeen={handleSeen}
                        onRemove={handleRemove}
                        requestRemove={requestRemove}
                        cancelRemove={cancelRemove}
                        confirming={!!confirmRemove[item.id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="brand-mark" aria-hidden>
      <rect width="34" height="34" rx="9" />
      <path d="M7 21 L13 14 L18 18 L27 8" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AttentionCard({
  item,
  onSeen,
  onRemove,
  requestRemove,
  cancelRemove,
  confirming,
}: {
  item: WatchlistItem;
  onSeen: (id: number) => void;
  onRemove: (id: number) => void;
  requestRemove: (id: number) => void;
  cancelRemove: (id: number) => void;
  confirming: boolean;
}) {
  const changePct = item.change_since_last_view_pct;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <span className="symbol">{item.symbol}</span>
          <span className="price">{formatPrice(item.quote?.price ?? null, item.quote?.currency)}</span>
          {changePct != null && (
            <span className={`price-change-badge ${changePct >= 0 ? "up" : "down"}`}>
              {changePct >= 0 ? "▲" : "▼"} {formatPct(changePct)} since last view
            </span>
          )}
        </div>
        <div className="spark-wrap">
          <Sparkline values={item.quote?.spark ?? []} />
          <span className="spark-label">30d</span>
        </div>
      </div>
      <ul className="reasons">
        {item.fired.map((f, idx) => (
          <li key={idx} className={f.rule}>
            {f.message}
          </li>
        ))}
      </ul>
      {item.note && <p className="note">"{item.note}"</p>}
      <div className="card-actions">
        <button onClick={() => onSeen(item.id)}>Mark as seen</button>
        {confirming ? (
          <div className="confirm-remove">
            <span>Remove?</span>
            <button className="yes" onClick={() => onRemove(item.id)}>Yes</button>
            <button className="no" onClick={() => cancelRemove(item.id)}>No</button>
          </div>
        ) : (
          <button className="ghost" onClick={() => requestRemove(item.id)}>Remove</button>
        )}
      </div>
    </div>
  );
}

function Row({
  item,
  onSeen,
  onRemove,
  requestRemove,
  cancelRemove,
  confirming,
}: {
  item: WatchlistItem;
  onSeen: (id: number) => void;
  onRemove: (id: number) => void;
  requestRemove: (id: number) => void;
  cancelRemove: (id: number) => void;
  confirming: boolean;
}) {
  const stale = item.quote?.is_stale;
  const topSignal = item.fired[0];
  return (
    <tr className={item.has_attention ? "attention-row" : ""}>
      <td className="symbol">{item.symbol}</td>
      <td className="price-cell">{formatPrice(item.quote?.price ?? null, item.quote?.currency)}</td>
      <td>
        <div className="spark-wrap">
          <Sparkline values={item.quote?.spark ?? []} />
          <span className="spark-label">30d</span>
        </div>
      </td>
      <td className="signal-cell">
        {topSignal && (
          <>
            <span className={`rule-chip ${topSignal.rule}`}>
              {topSignal.rule === "price_move" && "↕ Price"}
              {topSignal.rule === "unusual_volume" && "⚡ Volume"}
              {topSignal.rule === "week52_high" && "▲ 52w High"}
              {topSignal.rule === "week52_low" && "▼ 52w Low"}
            </span>
            <span className="signal-reason">{topSignal.message}</span>
          </>
        )}
      </td>
      <td className={pctClass(item.change_since_added_pct)}>{formatPct(item.change_since_added_pct)}</td>
      <td className={pctClass(item.change_since_last_view_pct)}>
        {formatPct(item.change_since_last_view_pct)}
      </td>
      <td className={stale ? "stale" : "fresh"}>
        {stale ? "stale · " : ""}
        {formatRelative(item.quote?.fetched_at ?? null)}
      </td>
      <td className="note-cell">{item.note ?? ""}</td>
      <td className="row-actions">
        <button onClick={() => onSeen(item.id)}>Seen</button>
        {confirming ? (
          <div className="confirm-remove">
            <span>Sure?</span>
            <button className="yes" onClick={() => onRemove(item.id)}>Yes</button>
            <button className="no" onClick={() => cancelRemove(item.id)}>No</button>
          </div>
        ) : (
          <button className="ghost" onClick={() => requestRemove(item.id)}>✕</button>
        )}
      </td>
    </tr>
  );
}

function pctClass(v: number | null): string {
  if (v == null) return "";
  return v >= 0 ? "positive" : "negative";
}

export default App;
