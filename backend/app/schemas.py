import datetime

from pydantic import BaseModel


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
