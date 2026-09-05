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
  const changePct = item.change_since_last_view_pct;
  const topReasons = item.fired.slice(0, 2);

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
        <div>
          <span className="dc-symbol">{item.symbol}</span>
          <span className="dc-price">{formatPrice(item.quote?.price ?? null, item.quote?.currency)}</span>
        </div>
        <Sparkline values={item.quote?.spark ?? []} markerValue={item.price_at_last_view} width={88} height={30} />
      </div>

      {changePct != null && (
        <span className={`dc-change-badge ${pctClass(changePct)}`}>
          {changePct >= 0 ? "▲" : "▼"} {formatPct(changePct)} since last view
        </span>
      )}

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
