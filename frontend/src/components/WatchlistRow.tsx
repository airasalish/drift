import { Sparkline } from "../Sparkline";
import { formatPct, formatPrice, pctClass } from "../format";
import type { WatchlistItem } from "../types";

export function WatchlistRow({ item, onClick }: { item: WatchlistItem; onClick: () => void }) {
  const stale = item.quote?.is_stale;

  return (
    <button type="button" className="watchlist-row" onClick={onClick}>
      <div className="wr-symbol-block">
        <span className="wr-symbol">{item.symbol}</span>
        {item.note && <span className="wr-thesis">{item.note}</span>}
      </div>

      <div className="wr-spark">
        <Sparkline values={item.quote?.spark ?? []} markerValue={item.price_at_last_view} width={72} height={28} />
      </div>

      <div className="wr-stat">
        <span className="wr-stat-label">Since last view</span>
        <span className={`wr-stat-value ${pctClass(item.change_since_last_view_pct)}`}>
          {formatPct(item.change_since_last_view_pct)}
        </span>
      </div>

      <div className="wr-stat wr-stat-muted">
        <span className="wr-stat-label">Since added</span>
        <span className={`wr-stat-value ${pctClass(item.change_since_added_pct)}`}>
          {formatPct(item.change_since_added_pct)}
        </span>
      </div>

      <div className="wr-price">
        {formatPrice(item.quote?.price ?? null, item.quote?.currency)}
        {stale && <span className="wr-stale-dot" title="Price may be stale" />}
      </div>
    </button>
  );
}
