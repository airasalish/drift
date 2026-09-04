import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { formatPct, formatPrice, formatRelative } from "./format";
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

  async function refresh() {
    try {
      const data = await api.list();
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
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
        <h1>Drift</h1>
        <p className="tagline">Not just prices — what actually changed since you last looked.</p>
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
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section>
            <h2>What changed since you last checked</h2>
            {attention.length === 0 ? (
              <p className="muted">Nothing needs your attention right now.</p>
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
              <p className="muted">Nothing on your watchlist yet — add a symbol above.</p>
            ) : (
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
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
            )}
          </section>
        </>
      )}
    </div>
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
        <span className="symbol">{item.symbol}</span>
        <span className="price">{formatPrice(item.quote?.price ?? null)}</span>
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
      <td>{formatPrice(item.quote?.price ?? null)}</td>
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
