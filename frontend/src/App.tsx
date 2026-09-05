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
import { formatPct } from "./format";
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
    watchlists,
    activeWatchlistId,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    switchWatchlist,
  } = useWatchlist();
  const [adding, setAdding] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<WatchlistItem | null>(null);
  const [view, setView] = useState<"watchlist" | "history">("watchlist");
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [watchlistQuery, setWatchlistQuery] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
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
      if (event.key.toLowerCase() === "f" && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Filter tracked symbols"]')?.focus();
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
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

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
      const { digest } = activeWatchlistId 
        ? await api.watchlists.digest(activeWatchlistId)
        : await api.digest();
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
    setDetailItem(null);
    setHistoryLoading(true);
    try {
      setHistoryEvents(activeWatchlistId 
        ? await api.watchlists.history(activeWatchlistId)
        : await api.history());
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
        onShowHome={() => {
          setView("watchlist");
          setDetailItem(null);
          setWatchlistQuery("");
        }}
        onShowHistory={handleShowHistory}
        watchlists={watchlists}
        activeWatchlistId={activeWatchlistId}
        onCreateWatchlist={createWatchlist}
        onRenameWatchlist={renameWatchlist}
        onDeleteWatchlist={deleteWatchlist}
        onSwitchWatchlist={switchWatchlist}
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

        <section className="command-center-head">
          <div>
            <span className="command-kicker">DRIFT / COMMAND CENTER</span>
            <h2>{greeting}{username ? `, ${username}` : ""}.</h2>
            <p>Here is what changed while you were away.</p>
          </div>
          <div className="command-nav" aria-label="Workspace sections">
            <button type="button" className="active" onClick={() => { setView("watchlist"); setDetailItem(null); }}>Overview</button>
            <button type="button" onClick={() => document.getElementById("attention-feed")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Insights</button>
            <button type="button" onClick={() => setWorkspaceNotice("News is a planned extension. Drift currently stays focused on price, volume, and range signals.")}>News <span>preview</span></button>
            <button type="button" onClick={() => setWorkspaceNotice("Alerts will build on Drift's existing explainable rules. The current attention feed is the live version.")}>Alerts <span>preview</span></button>
          </div>
        </section>

        <nav className="mobile-workspace-nav" aria-label="Workspace navigation">
          <button type="button" className={view === "watchlist" ? "active" : ""} onClick={() => { setView("watchlist"); setDetailItem(null); }}>Home <span>{items.length}</span></button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={handleShowHistory}>History</button>
        </nav>

        <section className="workspace-metrics" aria-label="Workspace metrics">
          <div className="workspace-metric metric-attention"><span>ATTENTION</span><strong>{attentionItems.length}</strong><small>{attentionItems.length ? "things worth checking" : "all quiet right now"}</small></div>
          <div className="workspace-metric"><span>WATCHLIST</span><strong>{items.length}</strong><small>tracked symbols</small></div>
          <div className="workspace-metric"><span>FILTERED OUT</span><strong>{quietItems.length}</strong><small>normal movements</small></div>
          <div className="workspace-metric metric-benchmark"><span>{benchmark?.benchmark_label ?? "BENCHMARK"}</span><strong>{benchmark?.benchmark_pct != null ? formatPct(benchmark.benchmark_pct) : "—"}</strong><small>{benchmark ? "market context" : "updating context"}</small></div>
        </section>

        <AddStockForm onAdd={handleAdd} adding={adding} />

        <div className="workspace-shortcuts" aria-label="Workspace shortcuts">
          <button type="button" className="workspace-shortcut" onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Filter tracked symbols"]')?.focus()}>
            <span className="shortcut-icon">⌁</span><span><strong>Track what matters</strong><small>Focus on real moves, not noise.</small></span><b>›</b>
          </button>
          <button type="button" className="workspace-shortcut" onClick={toggleBeginnerMode}>
            <span className="shortcut-icon">◌</span><span><strong>Get clearer explanations</strong><small>{beginnerMode ? "Beginner mode is on." : "Translate signals into plain language."}</small></span><b>›</b>
          </button>
          <button type="button" className="workspace-shortcut" onClick={handleShowHistory}>
            <span className="shortcut-icon">▥</span><span><strong>Make better decisions</strong><small>See what changed after you looked.</small></span><b>›</b>
          </button>
        </div>

        {workspaceNotice && (
          <div className="workspace-notice" role="status">
            <span>{workspaceNotice}</span>
            <button type="button" onClick={() => setWorkspaceNotice(null)} aria-label="Dismiss notice">×</button>
          </div>
        )}

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
              lastRefreshedAt={lastRefreshedAt}
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
