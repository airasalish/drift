import datetime

from pydantic import BaseModel


class WatchlistCreate(BaseModel):
    name: str


class WatchlistUpdate(BaseModel):
    name: str


class WatchlistOut(BaseModel):
    id: int
    name: str
    created_at: datetime.datetime


class WatchlistItemCreate(BaseModel):
    symbol: str
    note: str | None = None
    company_name: str | None = None


class WatchlistItemNoteUpdate(BaseModel):
    note: str | None = None


class FiredRule(BaseModel):
    rule: str
    message: str
    value: float


class QuoteOut(BaseModel):
    currency: str | None
    price: float | None
    prev_close: float | None
    volume: float | None
    week52_high: float | None
    week52_low: float | None
    fetched_at: datetime.datetime | None
    fetch_ok: bool
    is_stale: bool
    spark: list[float]


class HistoryEventOut(BaseModel):
    id: int
    symbol: str
    company_name: str | None
    seen_at: datetime.datetime
    price_at_seen: float | None
    current_price: float | None
    currency: str | None
    change_since_pct: float | None


class WatchlistItemOut(BaseModel):
    id: int
    symbol: str
    note: str | None
    company_name: str | None
    company_website: str | None
    added_at: datetime.datetime
    added_price: float | None
    last_viewed_at: datetime.datetime | None
    price_at_last_view: float | None

    quote: QuoteOut | None
    change_since_added_pct: float | None
    change_since_last_view_pct: float | None

    fired: list[FiredRule]
    attention_score: float
    has_attention: bool


# ── Watchlist Templates ──

class WatchlistTemplateCreate(BaseModel):
    template_name: str  # Key from WATCHLIST_TEMPLATES
    watchlist_name: str  # Custom name for the created watchlist


class WatchlistTemplateOut(BaseModel):
    template_name: str
    display_name: str
    description: str
    symbol_count: int


# ── Bulk Import ──

class BulkImportAnalyze(BaseModel):
    text: str
    watchlist_id: int


class BulkImportConfirm(BaseModel):
    watchlist_id: int
    symbols: list[str]  # De-duplicated, validated symbols to import


class BulkImportResult(BaseModel):
    valid: list[str]  # Symbols ready to import
    duplicates: list[str]  # Already in watchlist
    invalid: list[str]  # Failed validation
    total_parsed: int


# ── Related Stocks ──

class RelatedStockOut(BaseModel):
    symbol: str
    company_name: str | None
    sector: str | None


# ── Similar Moves ──

class SimilarMoveOut(BaseModel):
    date: datetime.datetime
    pct_change: float


class SimilarMovesOut(BaseModel):
    symbol: str
    today_pct_change: float
    similar_moves: list[SimilarMoveOut]
    message: str | None  # "not enough historical data yet" if applicable


# ── Chart Ranges ──

class ChartRangeOut(BaseModel):
    symbol: str
    range_name: str  # "1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"
    dates: list[datetime.datetime]
    closes: list[float]
    opens: list[float | None] | None = None  # OHLC available?
    highs: list[float | None] | None = None
    lows: list[float | None] | None = None
    volumes: list[float | None] | None = None
    currency: str | None


# ─── Multi-Watchlist Stock Membership ──

class StockMembershipOut(BaseModel):
    symbol: str
    company_name: str | None
    memberships: list[dict]  # Each has watchlist_id and name


# ─── Drifty Intelligence ──

class SelfAnalysisOut(BaseModel):
    today_pct_change: float
    normal_daily_move: float
    move_magnitude: str
    volume_vs_normal: float
    context: str


class PeerAnalysisOut(BaseModel):
    watchlist_size: int
    same_direction_count: int
    avg_peer_move: float
    comparison: str
    cluster: dict | None  # { name: str, symbols: list[str], trend: str } | None


class MarketAnalysisOut(BaseModel):
    benchmark_move: float
    outperformance: float
    context: str


class DriftyOut(BaseModel):
    symbol: str
    attention_score: int
    self_analysis: SelfAnalysisOut
    peer_analysis: PeerAnalysisOut
    market_analysis: MarketAnalysisOut
    why_interesting: list[str]


class DriftyRankedItem(BaseModel):
    symbol: str
    attention_score: int
    why: str


class DriftyWatchlistOut(BaseModel):
    watchlist_id: int
    total_items: int
    items_needing_attention: int
    ranked: list[DriftyRankedItem]
