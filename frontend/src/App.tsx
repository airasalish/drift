import { useEffect, useState } from "react";
import { api } from "./api";
import { AddStockForm } from "./components/AddStockForm";
import { FirstLookTour } from "./components/FirstLookTour";
import { Header } from "./components/Header";
import { HistoryPanel } from "./components/HistoryPanel";
import { IgnoredDisclosure } from "./components/IgnoredDisclosure";
import { QuickAccessRail } from "./components/QuickAccessRail";
import { SinceYouLeft } from "./components/SinceYouLeft";
import { StockDrawer } from "./components/StockDrawer";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { useWatchlist } from "./hooks/useWatchlist";
import { attentionTier, latestViewedAt } from "./lib/attention";
import type { HistoryEvent, WatchlistItem } from "./types";
import "./App.css";

const BEGINNER_MODE_KEY = "drift_beginner_mode";

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
  const {
    items,
    benchmark,
    loading,
    error,
    lastRefreshedAt,
    countdown,
    refresh,
    add,
    remove,
    markSeen,
    updateNote,
    resetToSample,
  } = useWatchlist();
  const [adding, setAdding] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<WatchlistItem | null>(null);
  const [view, setView] = useState<"watchlist" | "history">("watchlist");
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [watchlistQuery, setWatchlistQuery] = useState("");
  // per-viewer display preference only -- never a source of truth, the
  // rule engine's output is identical either way, this just rewords it
  const [beginnerMode, setBeginnerMode] = useState(() => {
    try {
      return localStorage.getItem(BEGINNER_MODE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [tourOpen, setTourOpen] = useState(() => {
    try {
      return sessionStorage.getItem("drift_pending_tour") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.removeItem("drift_pending_tour");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Search company or ticker"]')?.focus();
      }
      if (event.key === "r" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        refresh();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [refresh]);

  const marketOpen = isMarketOpen();

  const attentionItems = items.filter((i) => i.has_attention).sort((a, b) => b.attention_score - a.attention_score);
  const quietItems = items.filter((i) => attentionTier(i) === "quiet");

  // keep the open drawer in sync with the freshest poll data instead of a
  // stale snapshot from the moment it was opened
  const liveDetailItem = detailItem ? items.find((i) => i.id === detailItem.id) ?? null : null;
  const selectedId = liveDetailItem?.id ?? null;

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

  function handleSelect(item: WatchlistItem) {
    setView("watchlist");
    setDetailItem(item);
  }

  async function handleShowHistory() {
    setView("history");
    setHistoryLoading(true);
    try {
      setHistoryEvents(await api.history());
    } catch {
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleBeginnerMode() {
    setBeginnerMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BEGINNER_MODE_KEY, next ? "1" : "0");
      } catch {
        // localStorage unavailable (private mode, etc.) -- the toggle
        // still works for this session, it just won't persist
      }
      return next;
    });
  }

  return (
    <div className="app-shell">
      <QuickAccessRail
        items={items}
        selectedId={selectedId}
        view={view}
        onSelect={handleSelect}
        onShowHistory={handleShowHistory}
      />

      <div className="page">
        <section className="dashboard-cover" aria-label="Drift workspace introduction">
          <div className="dashboard-cover-art" aria-hidden="true" />
          <div className="dashboard-cover-copy">
            <span className="dashboard-cover-kicker">DRIFT / MARKET WORKSPACE</span>
            <strong>Markets move.<br />So do you.</strong>
            <span>Track what matters. Return with context.</span>
          </div>
          <span className="dashboard-cover-signal">LIVE CONTEXT <i /></span>
        </section>
        <Header
          username={username}
          onLogout={onLogout}
          itemCount={items.length}
          marketOpen={marketOpen}
          lastRefreshedAt={lastRefreshedAt}
          countdown={countdown}
          loading={loading}
          error={error}
          beginnerMode={beginnerMode}
          onToggleBeginnerMode={toggleBeginnerMode}
          onRefresh={refresh}
        />

        <AddStockForm onAdd={handleAdd} adding={adding} />

        {error && (
          <div className="error-row">
            <div className="error">{error}</div>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {view === "history" ? (
          <HistoryPanel events={historyEvents} loading={historyLoading} />
        ) : loading ? (
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
              beginnerMode={beginnerMode}
              onExplain={handleExplain}
              onSeen={markSeen}
              onOpenDetail={setDetailItem}
            />

            <WatchlistPanel
              items={items}
              selectedId={selectedId}
              query={watchlistQuery}
              onQueryChange={setWatchlistQuery}
              onOpenDetail={setDetailItem}
              attentionCount={attentionItems.length}
              onResetSample={async () => {
                await resetToSample();
                setTourOpen(true);
              }}
            />

            <IgnoredDisclosure items={quietItems} />
          </>
        )}

        <StockDrawer
          item={liveDetailItem}
          beginnerMode={beginnerMode}
          onClose={() => setDetailItem(null)}
          onSeen={markSeen}
          onRemove={handleRemove}
          onUpdateNote={updateNote}
        />
      </div>

      <FirstLookTour open={tourOpen && !loading} onClose={() => setTourOpen(false)} />
    </div>
  );
}

export default App;
