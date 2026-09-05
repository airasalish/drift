import { useState } from "react";
import { formatPct, pctClass } from "../format";
import type { WatchlistItem } from "../types";

// The product's intelligence shows through what it chooses NOT to surface.
// Collapsed by default -- this is a disclosure for the curious, not a
// second table competing with the watchlist above it.
export function IgnoredDisclosure({ items }: { items: WatchlistItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <section className="ignored-disclosure">
      <button type="button" className="ignored-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden>
          ▸
        </span>
        What Drift ignored
        <span className="ignored-count">
          {items.length} normal movement{items.length !== 1 ? "s" : ""} filtered out
        </span>
      </button>
      {open && (
        <ul className="ignored-list">
          {items.map((item) => {
            const pct = item.change_since_last_view_pct ?? item.change_since_added_pct;
            return (
              <li key={item.id}>
                <span className="ignored-symbol">{item.symbol}</span>
                <span className={pctClass(pct)}>{formatPct(pct)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
