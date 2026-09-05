export interface FiredRule {
  rule: string;
  message: string;
  value: number;
}

export interface Quote {
  currency: string | null;
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

export interface HistoryEvent {
  id: number;
  symbol: string;
  company_name: string | null;
  seen_at: string;
  price_at_seen: number | null;
  current_price: number | null;
  currency: string | null;
  change_since_pct: number | null;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  note: string | null;
  company_name: string | null;
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
