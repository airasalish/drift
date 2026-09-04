import datetime
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_user import get_or_create_demo_watchlist
from app.models import SymbolQuote, WatchlistItem
from app.schemas import FiredRule, QuoteOut, WatchlistItemCreate, WatchlistItemOut
from app.services import change_detection
from app.services.market_data import fetch_symbol_stats

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
STALE_AFTER_SECONDS = POLL_INTERVAL_SECONDS * 3


def _serialize(item: WatchlistItem, quote: SymbolQuote | None) -> WatchlistItemOut:
    quote_out = None
    fired: list[FiredRule] = []
    score = 0.0
    has_attention = False

    change_since_added = None
    change_since_last_view = None

    if quote is not None:
        is_stale = (
            not quote.fetch_ok
            or quote.fetched_at is None
            or (datetime.datetime.utcnow() - quote.fetched_at).total_seconds()
            > STALE_AFTER_SECONDS
        )
        try:
            spark = json.loads(quote.spark_closes_json) if quote.spark_closes_json else []
        except (TypeError, ValueError):
            spark = []

        quote_out = QuoteOut(
            price=quote.price,
            prev_close=quote.prev_close,
            volume=quote.volume,
            week52_high=quote.week52_high,
            week52_low=quote.week52_low,
            fetched_at=quote.fetched_at,
            fetch_ok=quote.fetch_ok,
            is_stale=is_stale,
            spark=spark,
        )

        if quote.price is not None:
            if item.added_price:
                change_since_added = (quote.price - item.added_price) / item.added_price
            if item.price_at_last_view:
                change_since_last_view = (quote.price - item.price_at_last_view) / item.price_at_last_view

        result = change_detection.evaluate(item.price_at_last_view, quote)
        fired = [FiredRule(**f) for f in result["fired"]]
        score = result["score"]
        has_attention = result["attention"]

    return WatchlistItemOut(
        id=item.id,
        symbol=item.symbol,
        note=item.note,
        added_at=item.added_at,
        added_price=item.added_price,
        last_viewed_at=item.last_viewed_at,
        price_at_last_view=item.price_at_last_view,
        quote=quote_out,
        change_since_added_pct=change_since_added,
        change_since_last_view_pct=change_since_last_view,
        fired=fired,
        attention_score=score,
        has_attention=has_attention,
    )


@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist(db: Session = Depends(get_db)):
    watchlist = get_or_create_demo_watchlist(db)
    db.commit()

    out = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote))

    out.sort(key=lambda w: w.attention_score, reverse=True)
    return out


@router.post("", response_model=WatchlistItemOut)
def add_symbol(payload: WatchlistItemCreate, db: Session = Depends(get_db)):
    watchlist = get_or_create_demo_watchlist(db)
    symbol = payload.symbol.strip().upper()
    if not symbol:
        raise HTTPException(400, "symbol is required")

    existing = next((i for i in watchlist.items if i.symbol == symbol), None)
    if existing:
        raise HTTPException(409, f"{symbol} is already on your watchlist")

    quote = db.get(SymbolQuote, symbol)
    if quote is None:
        # don't make the user wait up to a full poll interval to see a price
        # they just asked for — fetch this one synchronously, then it falls
        # into the regular shared poll cycle like everything else
        stats = fetch_symbol_stats(symbol)
        if stats is None:
            raise HTTPException(422, f"couldn't find market data for '{symbol}'")
        spark_closes = stats.pop("spark_closes")
        quote = SymbolQuote(symbol=symbol, watch_count=0, fetch_ok=True, **stats)
        quote.spark_closes_json = json.dumps(spark_closes)
        quote.fetched_at = datetime.datetime.utcnow()
        db.add(quote)
        db.flush()

    added_price = quote.price

    item = WatchlistItem(
        watchlist_id=watchlist.id,
        symbol=symbol,
        note=payload.note,
        added_price=added_price,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return _serialize(item, quote)


@router.delete("/{item_id}")
def remove_symbol(item_id: int, db: Session = Depends(get_db)):
    watchlist = get_or_create_demo_watchlist(db)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/seen", response_model=WatchlistItemOut)
def mark_seen(item_id: int, db: Session = Depends(get_db)):
    """Explicit 'I looked at this' action — the only thing that moves
    last_viewed_at / price_at_last_view forward. Never done implicitly by a
    background poll or a page load. See PROJECT_BRIEF.md §3.
    """
    watchlist = get_or_create_demo_watchlist(db)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")

    quote = db.get(SymbolQuote, item.symbol)
    item.last_viewed_at = datetime.datetime.utcnow()
    item.price_at_last_view = quote.price if quote else None
    db.commit()
    db.refresh(item)

    return _serialize(item, quote)
