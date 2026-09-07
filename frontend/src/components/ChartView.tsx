import { useEffect, useRef, useState } from 'react';
import type { WatchlistItem } from '../types';
import { ChartPanel } from './ChartPanel';
import { CompanyFavicon } from './CompanyFavicon';
import { DriftyPanel } from './DriftyPanel';
import './ChartView.css';

const LEFT_COLLAPSED_KEY = 'drift_chart_left_collapsed';

export function ChartView({
  items,
  selectedId,
  onSelectStock,
  activeWatchlistId,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  onSelectStock: (item: WatchlistItem) => void;
  activeWatchlistId: number | null;
}) {
  const selectableItems = items.filter(i => i.id !== -1);
  const selectedIndex = selectableItems.findIndex(i => i.id === selectedId);
  const selectedItem = selectedIndex >= 0 ? selectableItems[selectedIndex] : selectableItems[0] || null;

  const containerRef = useRef<HTMLDivElement>(null);

  // The watchlist navigator duplicates the outer rail's own stock list --
  // useful as a quick switcher while charting, but it eats ~250px that the
  // chart itself could use. Collapsible, and remembered across visits so
  // it doesn't reset every time the user comes back to Charts.
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LEFT_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LEFT_COLLAPSED_KEY, leftCollapsed ? '1' : '0');
    } catch {
      // ignore -- private browsing / storage disabled, collapse state just won't persist
    }
  }, [leftCollapsed]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle arrow keys if not typing in an input
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (typing) return;

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIndex = selectedIndex;
        if (e.key === 'ArrowUp') {
          nextIndex = Math.max(0, selectedIndex - 1);
        } else {
          nextIndex = Math.min(selectableItems.length - 1, selectedIndex + 1);
        }
        if (nextIndex >= 0 && nextIndex < selectableItems.length) {
          onSelectStock(selectableItems[nextIndex]);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, selectableItems, onSelectStock]);

  return (
    <div className={`chart-view${leftCollapsed ? ' left-collapsed' : ''}`} ref={containerRef}>
      {/* Left Panel: Watchlist Navigator -- collapsible so the chart can take over the freed width */}
      <div className="chart-view-left">
        <button
          type="button"
          className="chart-view-left-toggle"
          onClick={() => setLeftCollapsed((v) => !v)}
          aria-label={leftCollapsed ? 'Show watchlist panel' : 'Hide watchlist panel'}
          title={leftCollapsed ? 'Show watchlist' : 'Hide watchlist'}
        >
          {leftCollapsed ? '›' : '‹'}
        </button>
        {!leftCollapsed && (
          <div className="watchlist-nav">
            <div className="watchlist-nav-header">
              <h3>Watchlist</h3>
              <span className="watchlist-count">{selectableItems.length}</span>
            </div>
            <div className="watchlist-items">
              {selectableItems.map((item) => (
                <button
                  key={item.id}
                  className={`watchlist-item ${item.id === selectedId ? 'active' : ''}`}
                  onClick={() => onSelectStock(item)}
                  data-symbol={item.symbol}
                >
                  <div className="item-header">
                    <span className="item-symbol">
                      <CompanyFavicon domain={item.company_website} symbol={item.symbol} />
                      {item.symbol}
                    </span>
                    {item.has_attention && <span className="attention-badge" title="Flagged">●</span>}
                  </div>
                  <div className="item-price">
                    ${item.quote?.price?.toFixed(2) ?? 'N/A'}
                    {item.change_since_last_view_pct !== null && (
                      <span
                        className={item.change_since_last_view_pct >= 0 ? 'positive' : 'negative'}
                        title="Change since you last looked at this stock, not today's change"
                      >
                        {item.change_since_last_view_pct >= 0 ? '+' : ''}{(item.change_since_last_view_pct * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  {/* Matches the "since last view" label convention used
                      everywhere else in the app (WatchlistRow, StockDrawer) --
                      an unlabeled % next to a price reads as "today's change"
                      by universal finance-app convention, which this isn't. */}
                  {item.change_since_last_view_pct !== null && (
                    <div className="item-price-label">since last view</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Center Panel: Chart */}
      <div className="chart-view-center">
        {selectedItem ? (
          <ChartPanel item={selectedItem} />
        ) : (
          <div className="chart-empty">
            <span>Add a stock to your watchlist to get started</span>
          </div>
        )}
      </div>

      {/* Right Panel: Drifty Intelligence */}
      <div className="chart-view-right">
        {selectedItem ? (
          <DriftyPanel item={selectedItem} watchlistId={activeWatchlistId} />
        ) : (
          <div className="drifty-empty">
            <span>Select a stock to see Drifty analysis</span>
          </div>
        )}
      </div>
    </div>
  );
}
