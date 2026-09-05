import { describe, expect, it } from "vitest";
import { attentionTier, latestViewedAt } from "./attention";
import type { WatchlistItem } from "../types";

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: 1,
    symbol: "NVDA",
    note: null,
    company_name: null,
    company_website: null,
    added_at: "2026-01-01T00:00:00",
    added_price: 100,
    last_viewed_at: null,
    price_at_last_view: null,
    quote: null,
    change_since_added_pct: null,
    change_since_last_view_pct: null,
    fired: [],
    attention_score: 0,
    has_attention: false,
    ...overrides,
  };
}

describe("attentionTier", () => {
  it("returns quiet when the rule engine did not flag the item", () => {
    expect(attentionTier(item({ has_attention: false, attention_score: 9 }))).toBe("quiet");
  });

  it("returns needs-attention for a strong score", () => {
    expect(attentionTier(item({ has_attention: true, attention_score: 2 }))).toBe("needs-attention");
  });

  it("returns needs-attention when two signals fired together", () => {
    expect(
      attentionTier(
        item({
          has_attention: true,
          attention_score: 1.5,
          fired: [
            { rule: "unusual_volume", message: "vol", value: 1 },
            { rule: "week52_high", message: "high", value: 1 },
          ],
        })
      )
    ).toBe("needs-attention");
  });

  it("returns worth-checking for a single weaker signal", () => {
    expect(
      attentionTier(
        item({
          has_attention: true,
          attention_score: 1,
          fired: [{ rule: "unusual_volume", message: "vol", value: 1 }],
        })
      )
    ).toBe("worth-checking");
  });
});

describe("latestViewedAt", () => {
  it("returns null when nothing has been viewed", () => {
    expect(latestViewedAt([item(), item({ id: 2, last_viewed_at: null })])).toBeNull();
  });

  it("returns the most recent last_viewed_at", () => {
    const older = item({ id: 1, last_viewed_at: "2026-01-01T10:00:00" });
    const newer = item({ id: 2, last_viewed_at: "2026-01-02T10:00:00" });
    expect(latestViewedAt([older, newer])).toBe("2026-01-02T10:00:00");
  });
});
