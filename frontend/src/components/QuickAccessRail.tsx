import { attentionTier } from "../lib/attention";
import type { WatchlistItem } from "../types";
import { BrandMark } from "./BrandMark";

// A persistent quick-jump list, not fake page navigation -- Drift has one
// real view. This borrows Koyfin's actual useful pattern: the watchlist
// stays visible and clickable while a detail panel is open, so switching
// between stocks is one click instead of close-then-reopen. Hidden below
// a width where there isn't room for it (see App.css); the drawer already
// covers "get to a stock's detail" fine on narrow screens.
export function QuickAccessRail({
  items,
  selectedId,
  onSelect,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  onSelect: (item: WatchlistItem) => void;
}) {
  const sorted = [...items].sort((a, b) => b.attention_score - a.attention_score);

  return (
    <nav className="rail" aria-label="Watched symbols">
      <div className="rail-brand">
        <BrandMark />
      </div>
      {sorted.length > 0 && (
        <div className="rail-list">
          <span className="rail-label">Watching</span>
          {sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item${item.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(item)}
              title={item.company_name ?? item.symbol}
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
