import { CompanyFavicon } from "./CompanyFavicon";
import { Sparkline } from "../Sparkline";
import { formatPct, formatPrice, pctClass } from "../format";
import type { WatchlistItem } from "../types";

export function WatchlistRow({
  item,
  selected,
  onClick,
  tourAnchor,
}: {
  item: WatchlistItem;
  selected: boolean;
  onClick: () => void;
  tourAnchor?: boolean;
}) {
  const stale = item.quote?.is_stale;

  return (
    <button
      type="button"
      className={`watchlist-row${selected ? " selected" : ""}`}
      onClick={onClick}
      aria-label={`Open ${item.symbol} detail`}
      data-tour={tourAnchor ? "watchlist-row" : undefined}
    >
      <div className="wr-identity">
        <div className="wr-identity-top">
          <CompanyFavicon domain={item.company_website} symbol={item.symbol} />
          <span className="wr-symbol">{item.symbol}</span>
          {item.note && <span className="wr-thesis-pill">{item.note}</span>}
        </div>
        <span className="wr-company">{item.company_name ?? " "}</span>
      </div>

      <div className="wr-spark">
        <Sparkline values={item.quote?.spark ?? []} markerValue={item.price_at_last_view} width={64} height={26} />
      </div>

      {/* "since last view" is the hero number in this row -- bolder and
          larger than price, which is supporting information here */}
      <div className="wr-since">
        <span className="wr-since-label">Since last view</span>
        <span className={`wr-since-value ${pctClass(item.change_since_last_view_pct)}`}>
          {formatPct(item.change_since_last_view_pct)}
        </span>
      </div>

      <div className="wr-since-added">
        <span className="wr-since-label">Since added</span>
        <span className={pctClass(item.change_since_added_pct)}>{formatPct(item.change_since_added_pct)}</span>
      </div>

      <div className="wr-price">
        {formatPrice(item.quote?.price ?? null, item.quote?.currency)}
        {stale && <span className="wr-stale-dot" title="Price may be stale" />}
      </div>

      <span className="wr-chevron" aria-hidden>
        ›
      </span>
    </button>
  );
}
