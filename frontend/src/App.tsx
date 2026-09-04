import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { formatPct, formatPrice, formatRelative } from "./format";
import { Sparkline } from "./Sparkline";
import type { WatchlistItem } from "./types";
import "./App.css";

const REFRESH_MS = 15_000;

function App() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  async function refresh() {
    try {
      const data = await api.list();
      setItems(data);
      setError(null);
      setDigest(null); // the old digest may no longer match a changed attention set
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
    return () => clearInterval(id);
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
    await api.remove(id);
    refresh();
  }

  const attention = items.filter((i) => i.has_attention).sort((a, b) => b.attention_score - a.attention_score);
  const rest = items.filter((i) => !i.has_attention);

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

      <form className="add-form" onSubmit={handleAdd}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. AAPL"
          disabled={adding}
        />
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

      {error && <div className="error">{error}</div>}

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
              <div className="empty-box">Nothing needs your attention right now.</div>
            ) : (
              <div className="cards">
                {attention.map((item) => (
                  <AttentionCard key={item.id} item={item} onSeen={handleSeen} onRemove={handleRemove} />
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
                      <th>Trend</th>
                      <th>Since added</th>
                      <th>Since last view</th>
                      <th>Freshness</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...attention, ...rest].map((item) => (
                      <Row key={item.id} item={item} onSeen={handleSeen} onRemove={handleRemove} />
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
}: {
  item: WatchlistItem;
  onSeen: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <span className="symbol">{item.symbol}</span>
          <span className="price">{formatPrice(item.quote?.price ?? null)}</span>
        </div>
        <Sparkline values={item.quote?.spark ?? []} />
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
        <button className="ghost" onClick={() => onRemove(item.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}

function Row({
  item,
  onSeen,
  onRemove,
}: {
  item: WatchlistItem;
  onSeen: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const stale = item.quote?.is_stale;
  return (
    <tr className={item.has_attention ? "attention-row" : ""}>
      <td className="symbol">{item.symbol}</td>
      <td className="price-cell">{formatPrice(item.quote?.price ?? null)}</td>
      <td>
        <Sparkline values={item.quote?.spark ?? []} />
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
        <button className="ghost" onClick={() => onRemove(item.id)}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function pctClass(v: number | null): string {
  if (v == null) return "";
  return v >= 0 ? "positive" : "negative";
}

export default App;
