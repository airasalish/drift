export interface FiredRule {
  rule: string;
  message: string;
  value: number;
}

export interface Quote {
  price: number | null;
  prev_close: number | null;
  volume: number | null;
  week52_high: number | null;
  week52_low: number | null;
  fetched_at: string | null;
  fetch_ok: boolean;
  is_stale: boolean;
  spark: number[];
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  note: string | null;
  added_at: string;
  added_price: number | null;
  last_viewed_at: string | null;
  price_at_last_view: number | null;

  quote: Quote | null;
  change_since_added_pct: number | null;
  change_since_last_view_pct: number | null;

  fired: FiredRule[];
  attention_score: number;
  has_attention: boolean;
}
