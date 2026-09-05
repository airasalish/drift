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
  onOpenDetail,
}: {
  items: WatchlistItem[];
  onOpenDetail: (item: WatchlistItem) => void;
}) {
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: items.filter((i) => attentionTier(i) === tier).sort((a, b) => b.attention_score - a.attention_score),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="watchlist-panel">
      <h2>Your watchlist</h2>
      {items.length === 0 ? (
        <div className="empty-box">Nothing on your watchlist yet — add a symbol above.</div>
      ) : (
        grouped.map((g) => (
          <div key={g.tier} className={`tier-group tier-${g.tier}`}>
            <div className="tier-label">
              <span className={`tier-dot tier-${g.tier}`} />
              {TIER_LABEL[g.tier]}
              <span className="tier-count">{g.items.length}</span>
            </div>
            <div className="watchlist-rows">
              {g.items.map((item) => (
                <WatchlistRow key={item.id} item={item} onClick={() => onOpenDetail(item)} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
