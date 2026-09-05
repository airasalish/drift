import { Sparkline } from "../Sparkline";
import { formatPct, formatPrice, pctClass } from "../format";
import type { WatchlistItem } from "../types";

export function DriftCard({
  item,
  onOpenDetail,
  onSeen,
}: {
  item: WatchlistItem;
  onOpenDetail: (item: WatchlistItem) => void;
  onSeen: (id: number) => void;
}) {
  const topReasons = item.fired.slice(0, 2);

  // "since last view" is the hero number here -- price is supporting
  // information, not the headline. Falls back to "since added" only for a
  // symbol that's never had an explicit view yet.
  const primaryPct = item.change_since_last_view_pct ?? item.change_since_added_pct;
  const primaryLabel = item.change_since_last_view_pct != null ? "since last view" : "since added";

  return (
    <div
      className="drift-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenDetail(item);
      }}
    >
      <div className="dc-head">
        <span className="dc-symbol">
          {item.symbol}
          {item.company_name && <span className="dc-company"> · {item.company_name}</span>}
        </span>
        <Sparkline values={item.quote?.spark ?? []} markerValue={item.price_at_last_view} width={80} height={28} />
      </div>

      {primaryPct != null && (
        <div className="dc-primary">
          <span className={`dc-primary-value ${pctClass(primaryPct)}`}>{formatPct(primaryPct)}</span>
          <span className="dc-primary-label">{primaryLabel}</span>
        </div>
      )}

      <div className="dc-secondary-price">
        {formatPrice(item.quote?.price ?? null, item.quote?.currency)}
        <span className="dc-now-label">now</span>
      </div>

      <ul className="reasons">
        {topReasons.map((f, idx) => (
          <li key={idx} className={f.rule}>
            {f.message}
          </li>
        ))}
      </ul>

      {item.note && <p className="dc-thesis">Your reason: "{item.note}"</p>}

      <div className="dc-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSeen(item.id);
          }}
        >
          Mark as seen
        </button>
      </div>
    </div>
  );
}
