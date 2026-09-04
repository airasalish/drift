import datetime

from pydantic import BaseModel


class WatchlistItemCreate(BaseModel):
    symbol: str
    note: str | None = None


class FiredRule(BaseModel):
    rule: str
    message: str
    value: float


class QuoteOut(BaseModel):
    price: float | None
    prev_close: float | None
    volume: float | None
    week52_high: float | None
    week52_low: float | None
    fetched_at: datetime.datetime | None
    fetch_ok: bool
    is_stale: bool


class WatchlistItemOut(BaseModel):
    id: int
    symbol: str
    note: str | None
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
