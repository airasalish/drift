import type { BenchmarkOut } from "../api";
import { formatTimeOfDay } from "../format";
import type { WatchlistItem } from "../types";
import { DriftCard } from "./DriftCard";
import { MarketContext } from "./MarketContext";

// The dominant home experience: "what changed while I was away," not "here
// are your stocks." A calm, successful-feeling empty state matters as much
// as the drifted list -- "nothing happened" is the product working, not the
// product being empty.
export function SinceYouLeft({
  attentionItems,
  quietCount,
  latestViewed,
  benchmark,
  digest,
  digestLoading,
  beginnerMode,
  onExplain,
  onSeen,
  onOpenDetail,
}: {
  attentionItems: WatchlistItem[];
  quietCount: number;
  latestViewed: string | null;
  benchmark: BenchmarkOut | null;
  digest: string | null;
  digestLoading: boolean;
  beginnerMode: boolean;
  onExplain: () => void;
  onSeen: (id: number) => void;
  onOpenDetail: (item: WatchlistItem) => void;
}) {
  const hasAttention = attentionItems.length > 0;

  return (
    <section className="hero">
      <div className="hero-head">
        <div className="hero-headline-block">
          <span className="hero-eyebrow">
            {latestViewed ? `Since you checked at ${formatTimeOfDay(latestViewed)}` : "Since you added these"}
          </span>
          <h2 className="hero-headline">
            {hasAttention ? `${attentionItems.length} thing${attentionItems.length !== 1 ? "s" : ""} drifted` : "All quiet"}
          </h2>
        </div>
        {hasAttention && (
          <button className="explain-btn" onClick={onExplain} disabled={digestLoading}>
            {digestLoading ? "Summarizing…" : "Explain this"}
          </button>
        )}
      </div>

      {!hasAttention && (
        <p className="hero-calm-copy">
          Nothing moved meaningfully across your watchlist.
          {quietCount > 0 && ` ${quietCount} normal movement${quietCount !== 1 ? "s" : ""} filtered out.`}
        </p>
      )}

      <MarketContext benchmark={benchmark} />

      {digest && <p className="digest">{digest}</p>}

      {hasAttention && (
        <div className="drift-cards">
          {attentionItems.map((item) => (
            <DriftCard key={item.id} item={item} beginnerMode={beginnerMode} onOpenDetail={onOpenDetail} onSeen={onSeen} />
          ))}
        </div>
      )}
    </section>
  );
}
