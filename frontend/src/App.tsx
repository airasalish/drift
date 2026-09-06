import { useEffect, useState } from "react";
import { api } from "./api";
import { AddStockForm } from "./components/AddStockForm";
import { ChartView } from "./components/ChartView";
import { FirstLookTour } from "./components/FirstLookTour";
import { Header } from "./components/Header";
import { HistoryPanel } from "./components/HistoryPanel";
import { IgnoredDisclosure } from "./components/IgnoredDisclosure";
import { QuickAccessRail } from "./components/QuickAccessRail";
import { SinceYouLeft } from "./components/SinceYouLeft";
import { StockDrawer } from "./components/StockDrawer";
import { SuggestedCompanies } from "./components/SuggestedCompanies";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { WatchlistPickerModal } from "./components/WatchlistPickerModal";
import { useWatchlist } from "./hooks/useWatchlist";
import { attentionTier, latestViewedAt } from "./lib/attention";
import { simplifyRuleMessage } from "./lib/beginner";
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
  return day >= 1 && day <= 5 && minOfDay >= 570 && minOfDay < 960; // 9:30 to 16:00
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
  const [pickerRequest, setPickerRequest] = useState<{ symbol: string; companyName?: string; note?: string } | null>(null);
  const [demoResetting, setDemoResetting] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<WatchlistItem | null>(null);
  const [chartSelectedItem, setChartSelectedItem] = useState<WatchlistItem | null>(null);
  const [view, setView] = useState<"watchlist" | "history" | "chart">("watchlist");
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
  const displayName = username && username.toLowerCase() !== "demo" ? username : "";

  const attentionItems = items.filter((i) => i.has_attention && i.id !== -1).sort((a, b) => b.attention_score - a.attention_score);
  const quietItems = items.filter((i) => attentionTier(i) === "quiet" && i.id !== -1);
  const portfolioItem = items.find((i) => i.id === -1);

  // keep the open drawer in sync with the freshest poll data instead of a
  // stale snapshot from the moment it was opened
  const liveDetailItem = detailItem ? items.find((i) => i.id === detailItem.id) ?? null : null;
  const selectedId = liveDetailItem?.id ?? null;
  const chartSelectedId = chartSelectedItem ? items.find((i) => i.id === chartSelectedItem.id)?.id ?? null : null;

  // Every "add" entry point (suggestions, manual add, the detail drawer's
  // "manage watchlists") opens the same picker instead of silently
  // dropping the symbol into whichever watchlist happens to be active --
  // that silent-add was the bug: with multiple watchlists, "add" has to
  // mean "add to *which one(s)*", not "add to whatever's active".
  function openWatchlistPicker(symbol: string, companyName?: string, note?: string) {
    setPickerRequest({ symbol, companyName, note });
  }

  async function handleExplain() {
    setDigestLoading(true);
    try {
      const { digest } = activeWatchlistId 
        ? await api.watchlists.digest(activeWatchlistId)
        : await api.digest();
      setDigest(digest ?? "Couldn't generate a summary right now, the details below still apply.");
    } catch {
      setDigest("Couldn't generate a summary right now, the details below still apply.");
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
    setDetailItem((prev) => (prev?.id === item.id ? null : item));
  }

  // Separate from handleSelect: switching the chart's focused stock must not
  // change the view away from "chart" or pop open the detail drawer.
  function handleChartSelect(item: WatchlistItem) {
    setChartSelectedItem(item);
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
        onShowInsights={() => document.getElementById("attention-feed")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        watchlists={watchlists}
        activeWatchlistId={activeWatchlistId}
        onCreateWatchlist={createWatchlist}
        onRenameWatchlist={renameWatchlist}
        onDeleteWatchlist={deleteWatchlist}
        onSwitchWatchlist={switchWatchlist}
      />

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
          beginnerMode={beginnerMode}
          onToggleBeginnerMode={toggleBeginnerMode}
          onRefresh={refresh}
        />

        <section className="command-center-head">
          <div>
            <span className="command-kicker">DRIFT / COMMAND CENTER</span>
            <h2>{greeting}{displayName ? `, ${displayName}` : ""}.</h2>
            <p>Here is what changed while you were away.</p>
          </div>
          <div className="command-nav" aria-label="Workspace sections">
            <button type="button" className={view === "watchlist" ? "active" : ""} onClick={() => { setView("watchlist"); setDetailItem(null); }}>Overview</button>
            <button type="button" className={view === "chart" ? "active" : ""} onClick={() => { setView("chart"); setDetailItem(null); }}>Charts</button>
            <button type="button" onClick={() => document.getElementById("attention-feed")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Insights</button>
          </div>
        </section>

        <nav className="mobile-workspace-nav" aria-label="Workspace navigation">
          <button type="button" className={view === "watchlist" ? "active" : ""} onClick={() => { setView("watchlist"); setDetailItem(null); }}>Home <span>{items.length}</span></button>
          <button type="button" className={view === "chart" ? "active" : ""} onClick={() => { setView("chart"); setDetailItem(null); }}>Charts</button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={handleShowHistory}>History</button>
        </nav>

        <section className="workspace-metrics" aria-label="Workspace metrics">
          <div className="workspace-metric metric-benchmark"><span>{benchmark?.benchmark_label ?? "NIFTY 50"}</span><strong>{benchmark?.benchmark_pct != null ? formatPct(benchmark.benchmark_pct) : "N/A"}</strong><small>{benchmark ? "live market context" : "updating context"}</small></div>
          <div className="workspace-metric"><span>TRACKED</span><strong>{items.length}</strong><small>symbols in your workspace</small></div>
          <div className="workspace-metric"><span>QUIET TODAY</span><strong>{quietItems.length}</strong><small>normal moves filtered out</small></div>
        </section>

        <SuggestedCompanies
          trackedSymbols={new Set(items.map((item) => item.symbol))}
          onAdd={(symbol, companyName) => openWatchlistPicker(symbol, companyName)}
        />

        <AddStockForm onAdd={openWatchlistPicker} />

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

        {username?.toLowerCase() === "demo" && view === "watchlist" && (
          <section className="demo-start-card" data-tour="demo-reset">
            <div>
              <span className="demo-start-kicker">FIRST LOOK / SHARED DEMO</span>
              <h3>Start with a clean signal</h3>
              <p>The demo account is shared, so someone may have already marked symbols as seen. Reset once to load the curated sample and make Drift’s “things drifted” view meaningful for you.</p>
            </div>
            <button type="button" disabled={demoResetting} onClick={async () => { setDemoResetting(true); try { await resetToSample(); setTourOpen(true); } finally { setDemoResetting(false); } }}>
              {demoResetting ? "Preparing…" : "Reset & start tour →"}
            </button>
          </section>
        )}

        {error && (
          <div className="error-row">
            <div className="error">{error}</div>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {view === "history" ? (
          <HistoryPanel events={historyEvents} loading={historyLoading} />
        ) : view === "chart" ? (
          <ChartView
            items={items}
            selectedId={chartSelectedId}
            onSelectStock={handleChartSelect}
            activeWatchlistId={activeWatchlistId}
          />
        ) : loading ? (
          <div className="skeleton-block" />
        ) : (
          <>
            {portfolioItem && (
              <div className="portfolio-signal" data-tour="portfolio-signal">
                <div className="portfolio-signal-header">
                  <span className="portfolio-signal-icon">PORTFOLIO</span>
                  <h3>Portfolio-wide signal</h3>
                </div>
                <ul className="reasons">
                  {portfolioItem.fired.map((f, idx) => (
                    <li key={idx} className={f.rule}>
                      {beginnerMode ? simplifyRuleMessage(f) : f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
              onOpenDetail={handleSelect}
              displayName={displayName}
            />

            <WatchlistPanel
              items={items}
              selectedId={selectedId}
              query={watchlistQuery}
              onQueryChange={setWatchlistQuery}
              onOpenDetail={handleSelect}
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
          onManageWatchlists={(symbol, companyName) => openWatchlistPicker(symbol, companyName)}
          onOpenChart={(item) => { setChartSelectedItem(item); setDetailItem(null); setView("chart"); }}
        />
      </div>

      <FirstLookTour open={tourOpen && !loading} onClose={() => setTourOpen(false)} />
      {pickerRequest && (
        <WatchlistPickerModal
          symbol={pickerRequest.symbol}
          companyName={pickerRequest.companyName}
          note={pickerRequest.note}
          watchlists={watchlists}
          onClose={() => setPickerRequest(null)}
          onCreateWatchlist={createWatchlist}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

export default App;
