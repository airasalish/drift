import { attentionTier } from "../lib/attention";
import type { WatchlistItem } from "../types";
import { BrandMark } from "./BrandMark";

// A persistent quick-jump list plus a real second destination (History),
// not fake page navigation -- Drift doesn't get a "Markets" or
// "Dashboards" section here because there's no real content behind one.
// This borrows Koyfin's actual useful pattern: the watchlist stays visible
// and clickable while a detail panel is open, so switching between stocks
// is one click instead of close-then-reopen. Hidden below a width where
// there isn't room for it (see App.css); the drawer already covers
// "get to a stock's detail" fine on narrow screens.
export function QuickAccessRail({
  items,
  selectedId,
  view,
  onSelect,
  onShowHome,
  onShowHistory,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  view: "watchlist" | "history";
  onSelect: (item: WatchlistItem) => void;
  onShowHome: () => void;
  onShowHistory: () => void;
}) {
  const sorted = [...items].sort((a, b) => b.attention_score - a.attention_score);

  return (
    <nav className="rail" aria-label="Watched symbols" data-tour="rail">
      <div className="rail-brand">
        <BrandMark />
      </div>

      <button
        type="button"
        className={`rail-nav-item${view === "watchlist" ? " selected" : ""}`}
        onClick={onShowHome}
        aria-label="Open home"
        aria-current={view === "watchlist" ? "page" : undefined}
      >
        <span className="rail-nav-icon" aria-hidden="true">⌂</span>
        Home
      </button>

      <button
        type="button"
        className={`rail-nav-item${view === "history" ? " selected" : ""}`}
        onClick={onShowHistory}
        aria-label="Open history"
        aria-current={view === "history" ? "page" : undefined}
      >
        <span className="rail-nav-icon" aria-hidden="true">◷</span>
        History
      </button>

      {sorted.length > 0 && (
        <div className="rail-list">
          <span className="rail-label">Watching</span>
          {sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item${view === "watchlist" && item.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(item)}
              title={item.company_name ?? item.symbol}
              aria-label={`Open ${item.symbol}${item.company_name ? `, ${item.company_name}` : ""}`}
              aria-current={view === "watchlist" && item.id === selectedId ? "true" : undefined}
            >
              <span className={`rail-dot tier-${attentionTier(item)}`} />
              <span className="rail-symbol">{item.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
