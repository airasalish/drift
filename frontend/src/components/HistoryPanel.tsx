import { formatPct, formatPrice, formatRelative, pctClass } from "../format";
import type { HistoryEvent } from "../types";

// Drift's "remembers where you were" idea made literal: every time you've
// marked something seen, what it was trading at, and what's happened
// since. Real data from a real event log -- not a placeholder section.
export function HistoryPanel({ events, loading }: { events: HistoryEvent[]; loading: boolean }) {
  return (
    <section className="history-panel">
      <h2>Your history</h2>
      {loading ? (
        <div className="skeleton-block" />
      ) : events.length === 0 ? (
        <div className="empty-box">
          Nothing here yet, mark a stock as seen and it'll show up as a point in your history.
        </div>
      ) : (
        <div className="history-list">
          {events.map((e) => (
            <div key={e.id} className="history-row">
              <div className="hr-identity">
                <span className="hr-symbol">{e.symbol}</span>
                <span className="hr-company">{e.company_name ?? ""}</span>
              </div>
              <div className="hr-when">{formatRelative(e.seen_at)}</div>
              <div className="hr-price-at">
                <span className="hr-label">Then</span>
                {formatPrice(e.price_at_seen, e.currency)}
              </div>
              <div className="hr-price-now">
                <span className="hr-label">Now</span>
                {formatPrice(e.current_price, e.currency)}
              </div>
              <div className={`hr-change ${pctClass(e.change_since_pct)}`}>{formatPct(e.change_since_pct)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
