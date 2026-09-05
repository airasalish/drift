import { useState } from "react";
import { attentionTier, TIER_LABEL, type AttentionTier } from "../lib/attention";
import type { WatchlistItem } from "../types";
import { WatchlistRow } from "./WatchlistRow";

const TIER_ORDER: AttentionTier[] = ["needs-attention", "worth-checking", "quiet"];

// Attention is the primary organizing axis here, not the alphabet: each
// tier is a group, sorted by how urgently a stock needs a look, not by
// ticker. See lib/attention.ts for how a tier is derived from the rule
// engine's own score -- this component only renders the grouping.
export function WatchlistPanel({
  items,
  selectedId,
  query,
  onQueryChange,
  attentionCount,
  onOpenDetail,
  onResetSample,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  attentionCount: number;
  onOpenDetail: (item: WatchlistItem) => void;
  onResetSample: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((item) => `${item.symbol} ${item.company_name ?? ""} ${item.note ?? ""}`.toLowerCase().includes(normalizedQuery))
    : items;
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: filteredItems.filter((i) => attentionTier(i) === tier).sort((a, b) => b.attention_score - a.attention_score),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="watchlist-panel">
      <div className="wp-head">
        <div>
          <h2>Your watchlist</h2>
          <p className="wp-summary"><span>{items.length} tracked</span><span className="wp-summary-sep">·</span><span className={attentionCount > 0 ? "wp-summary-alert" : ""}>{attentionCount} needs a look</span></p>
        </div>
        {confirmingReset ? (
          <div className="confirm-remove">
            <span>Reset to sample?</span>
            <button
              className="yes"
              onClick={() => {
                onResetSample();
                setConfirmingReset(false);
              }}
            >
              Yes
            </button>
            <button className="no" onClick={() => setConfirmingReset(false)}>
              No
            </button>
          </div>
        ) : (
          <button type="button" className="wp-reset-link" onClick={() => setConfirmingReset(true)}>
            Reset to sample
          </button>
          )}
      </div>
      {items.length > 0 && (
        <div className="watchlist-filter-wrap">
          <span className="watchlist-filter-icon" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter tracked symbols"
            aria-label="Filter tracked symbols"
          />
          {query && <button type="button" className="watchlist-filter-clear" onClick={() => onQueryChange("")} aria-label="Clear filter">×</button>}
          <kbd>/</kbd>
        </div>
      )}
      {items.length === 0 ? (
        <div className="empty-box">Nothing on your watchlist yet — add a symbol above.</div>
      ) : grouped.length === 0 ? (
        <div className="empty-box filter-empty">No tracked symbols match “{query}”. <button type="button" onClick={() => onQueryChange("")}>Clear filter</button></div>
      ) : (
        grouped.map((g) => (
          <div key={g.tier} className={`tier-group tier-${g.tier}`}>
            <div className="tier-label">
              <span className={`tier-dot tier-${g.tier}`} />
              {TIER_LABEL[g.tier]}
              <span className="tier-count">{g.items.length}</span>
            </div>
            <div className="watchlist-rows">
              {g.items.map((item, idx) => (
                <WatchlistRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onClick={() => onOpenDetail(item)}
                  tourAnchor={idx === 0 && g.tier === grouped[0].tier}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
