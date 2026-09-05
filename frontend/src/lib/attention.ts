import type { WatchlistItem } from "../types";

export type AttentionTier = "needs-attention" | "worth-checking" | "quiet";

// Frontend-only bucketing of the backend's already-computed rule score --
// this never re-decides *whether* something is meaningful (has_attention is
// entirely the rule engine's call, see backend/app/services/change_detection.py).
// It only decides how urgently to group something that's already flagged.
// A real price move alone (PRICE_MOVE_WEIGHT = 2.0) or two-or-more signals
// firing together both read as "needs attention"; a single weaker signal
// (volume alone, or being near but not at a 52-week extreme) reads as
// "worth checking" -- deliberately readable straight from the fired list,
// not a black-box cutoff.
const NEEDS_ATTENTION_SCORE = 2.0;

export function attentionTier(item: WatchlistItem): AttentionTier {
  if (!item.has_attention) return "quiet";
  if (item.attention_score >= NEEDS_ATTENTION_SCORE || item.fired.length >= 2) return "needs-attention";
  return "worth-checking";
}

export const TIER_LABEL: Record<AttentionTier, string> = {
  "needs-attention": "Needs attention",
  "worth-checking": "Worth checking",
  quiet: "Quiet",
};

function toMs(iso: string): number {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
}

// The most recent explicit "seen" moment across the whole watchlist --
// used as the anchor for "since you checked at 6:42 PM" on the home hero.
// There's no app-level "last visit" concept server-side (only per-item
// last_viewed_at), so this is the closest honest proxy: it's real data, not
// a fabricated session timestamp.
export function latestViewedAt(items: WatchlistItem[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const item of items) {
    if (!item.last_viewed_at) continue;
    const ms = toMs(item.last_viewed_at);
    if (ms > bestMs) {
      bestMs = ms;
      best = item.last_viewed_at;
    }
  }
  return best;
}
