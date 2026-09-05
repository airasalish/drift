import { useState } from "react";
import { api } from "./api";
import { AddStockForm } from "./components/AddStockForm";
import { Header } from "./components/Header";
import { IgnoredDisclosure } from "./components/IgnoredDisclosure";
import { SinceYouLeft } from "./components/SinceYouLeft";
import { StockDrawer } from "./components/StockDrawer";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { useWatchlist } from "./hooks/useWatchlist";
import { attentionTier, latestViewedAt } from "./lib/attention";
import type { WatchlistItem } from "./types";
import "./App.css";

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const h = et.getHours();
  const m = et.getMinutes();
  const minOfDay = h * 60 + m;
  return day >= 1 && day <= 5 && minOfDay >= 570 && minOfDay < 960; // 9:30–16:00
}

function App({ username, onLogout }: { username: string | null; onLogout: () => void }) {
  const { items, benchmark, loading, error, lastRefreshedAt, countdown, refresh, add, remove, markSeen, updateNote } =
    useWatchlist();
  const [adding, setAdding] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<WatchlistItem | null>(null);

  const marketOpen = isMarketOpen();

  const attentionItems = items.filter((i) => i.has_attention).sort((a, b) => b.attention_score - a.attention_score);
  const quietItems = items.filter((i) => attentionTier(i) === "quiet");

  // keep the open drawer in sync with the freshest poll data instead of a
  // stale snapshot from the moment it was opened
  const liveDetailItem = detailItem ? items.find((i) => i.id === detailItem.id) ?? null : null;

  async function handleAdd(symbol: string, note: string, companyName?: string) {
    setAdding(true);
    try {
      await add(symbol, note, companyName);
    } finally {
      setAdding(false);
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

  async function handleRemove(id: number) {
    if (detailItem?.id === id) setDetailItem(null);
    await remove(id);
  }

  return (
    <div className="page">
      <Header
        username={username}
        onLogout={onLogout}
        itemCount={items.length}
        marketOpen={marketOpen}
        lastRefreshedAt={lastRefreshedAt}
        countdown={countdown}
        loading={loading}
        error={error}
      />

      <AddStockForm onAdd={handleAdd} adding={adding} />

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
          <SinceYouLeft
            attentionItems={attentionItems}
            quietCount={quietItems.length}
            latestViewed={latestViewedAt(items)}
            benchmark={benchmark}
            digest={digest}
            digestLoading={digestLoading}
            onExplain={handleExplain}
            onSeen={markSeen}
            onOpenDetail={setDetailItem}
          />

          <WatchlistPanel items={items} selectedId={liveDetailItem?.id ?? null} onOpenDetail={setDetailItem} />

          <IgnoredDisclosure items={quietItems} />
        </>
      )}

      <StockDrawer
        item={liveDetailItem}
        onClose={() => setDetailItem(null)}
        onSeen={markSeen}
        onRemove={handleRemove}
        onUpdateNote={updateNote}
      />
    </div>
  );
}

export default App;
