import { useEffect, useRef } from 'react';
import type { WatchlistItem } from '../types';
import { ChartPanel } from './ChartPanel';
import { DriftyPanel } from './DriftyPanel';
import './ChartView.css';

export function ChartView({
  items,
  selectedId,
  onSelectStock,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  onSelectStock: (item: WatchlistItem) => void;
}) {
  const selectableItems = items.filter(i => i.id !== -1);
  const selectedIndex = selectableItems.findIndex(i => i.id === selectedId);
  const selectedItem = selectedIndex >= 0 ? selectableItems[selectedIndex] : selectableItems[0] || null;

  const containerRef = useRef<HTMLDivElement>(null);

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
    <div className="chart-view" ref={containerRef}>
      {/* Left Panel: Watchlist Navigator */}
      <div className="chart-view-left">
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
                  <span className="item-symbol">{item.symbol}</span>
                  {item.has_attention && <span className="attention-badge" title="Flagged">●</span>}
                </div>
                <div className="item-price">
                  ${item.quote?.price?.toFixed(2) ?? 'N/A'}
                  {item.change_since_last_view_pct !== null && (
                    <span className={item.change_since_last_view_pct >= 0 ? 'positive' : 'negative'}>
                      {item.change_since_last_view_pct >= 0 ? '+' : ''}{(item.change_since_last_view_pct * 100).toFixed(2)}%
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
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
          <DriftyPanel item={selectedItem} />
        ) : (
          <div className="drifty-empty">
            <span>Select a stock to see Drifty analysis</span>
          </div>
        )}
      </div>
    </div>
  );
}
