import datetime
import json
import math
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_user import get_or_create_watchlist_for_user, seed_default_watchlist
from app.models import SeenEvent, SymbolQuote, User, Watchlist, WatchlistItem
from app.schemas import (
    FiredRule,
    HistoryEventOut,
    QuoteOut,
    WatchlistCreate,
    WatchlistItemCreate,
    WatchlistItemNoteUpdate,
    WatchlistItemOut,
    WatchlistOut,
    WatchlistUpdate,
)
from app.services import change_detection
from app.services.auth import get_current_user
from app.services.digest import generate_digest
from app.services.market_data import fetch_symbol_stats, lookup_company_website
from app.services.poller import BENCHMARK_SYMBOL

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

# Secondary router for watchlist CRUD operations
watchlists_router = APIRouter(prefix="/api/watchlists", tags=["watchlists"])

# real tickers are short and use a narrow character set; reject obvious
# garbage before spending a network call on yfinance. 20 chars comfortably
# covers exchange-suffixed symbols (e.g. "BAJFINANCE.NS" is 13) without
# accepting arbitrary-length input.
SYMBOL_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
STALE_AFTER_SECONDS = POLL_INTERVAL_SECONDS * 3


_NUMERIC_QUOTE_FIELDS = (
    "price",
    "prev_close",
    "volume",
    "avg_volume_20d",
    "avg_daily_move_pct_20d",
    "week52_high",
    "week52_low",
)


def _sanitize_quote(quote: SymbolQuote | None) -> None:
    """Defensive read-time NaN guard: fixes rows written before the fetch-
    time fix in market_data.py existed (see ENGINEERING_DECISIONS.md for the
    incident) without needing a manual DB fix or waiting for the next poll
    to overwrite them. Mutates the in-memory object only -- never committed,
    so the real poll cycle still owns correcting the stored row.
    """
    if quote is None:
        return
    for field in _NUMERIC_QUOTE_FIELDS:
        value = getattr(quote, field)
        if value is not None and math.isnan(value):
            setattr(quote, field, None)


def _sanitize_item(item: WatchlistItem) -> None:
    """Same NaN guard as _sanitize_quote, but for the two price snapshots
    stored directly on the watchlist item (added_price, price_at_last_view)
    -- both were captured from quote.price at some point in the past, so
    either can carry a NaN from before the source-level fix existed, same
    incident, different table.
    """
    if item.added_price is not None and math.isnan(item.added_price):
        item.added_price = None
    if item.price_at_last_view is not None and math.isnan(item.price_at_last_view):
        item.price_at_last_view = None


def _get_watchlist_or_404(db: Session, watchlist_id: int, user: User) -> Watchlist:
    """Get a watchlist by ID, ensuring it belongs to the current user.
    
    Returns 404 if the watchlist doesn't exist OR if it exists but belongs
    to another user (ownership enforced via 404, not 403, to match the
    existing "not found" pattern used elsewhere in this router).
    """
    watchlist = db.get(Watchlist, watchlist_id)
    if watchlist is None or watchlist.user_id != user.id:
        raise HTTPException(404, "not found")
    return watchlist


def _serialize(item: WatchlistItem, quote: SymbolQuote | None) -> WatchlistItemOut:
    _sanitize_quote(quote)
    _sanitize_item(item)
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
            # old rows can have a literal NaN token baked into the JSON
            # itself (json.loads parses it back to a real float('nan'))
            spark = [v for v in spark if not (isinstance(v, float) and math.isnan(v))]
        except (TypeError, ValueError):
            spark = []

        quote_out = QuoteOut(
            currency=quote.currency,
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

        previously_fired = (
            frozenset(json.loads(item.fired_rules_at_last_view)) if item.fired_rules_at_last_view else frozenset()
        )
        result = change_detection.evaluate(item.price_at_last_view, quote, previously_fired)
        fired = [FiredRule(**f) for f in result["fired"]]
        score = result["score"]
        has_attention = result["attention"]

    return WatchlistItemOut(
        id=item.id,
        symbol=item.symbol,
        note=item.note,
        company_name=item.company_name,
        company_website=item.company_website,
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


# ============================================================================
# WATCHLIST CRUD ENDPOINTS (new multi-watchlist support)
# ============================================================================

@watchlists_router.get("", response_model=list[WatchlistOut])
def list_watchlists(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List all watchlists belonging to the current user."""
    watchlists = db.query(Watchlist).filter_by(user_id=user.id).order_by(Watchlist.created_at).all()
    return [
        WatchlistOut(id=w.id, name=w.name, created_at=w.created_at) for w in watchlists
    ]


@watchlists_router.post("", response_model=WatchlistOut)
def create_watchlist(
    payload: WatchlistCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Create a new watchlist for the current user."""
    if not payload.name or not payload.name.strip():
        raise HTTPException(400, "name is required")
    
    watchlist = Watchlist(user_id=user.id, name=payload.name.strip())
    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)
    
    return WatchlistOut(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at)


@watchlists_router.patch("/{id}", response_model=WatchlistOut)
def rename_watchlist(
    id: int,
    payload: WatchlistUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rename a watchlist belonging to the current user."""
    watchlist = _get_watchlist_or_404(db, id, user)
    
    if not payload.name or not payload.name.strip():
        raise HTTPException(400, "name is required")
    
    watchlist.name = payload.name.strip()
    db.commit()
    db.refresh(watchlist)
    
    return WatchlistOut(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at)


@watchlists_router.delete("/{id}")
def delete_watchlist(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete a watchlist belonging to the current user.
    
    Blocks deletion if it's the user's last remaining watchlist — there must
    always be at least one watchlist per user.
    """
    watchlist = _get_watchlist_or_404(db, id, user)
    
    # Check if this is the user's last watchlist
    watchlist_count = db.query(Watchlist).filter_by(user_id=user.id).count()
    if watchlist_count <= 1:
        raise HTTPException(400, "cannot delete your last watchlist")
    
    db.delete(watchlist)
    db.commit()
    
    return {"ok": True}


# ============================================================================
# MULTI-WATCHLIST-AWARE ITEM ROUTES (new, alongside existing routes)
# ============================================================================

@watchlists_router.get("/{id}/items", response_model=list[WatchlistItemOut])
def list_watchlist_items(
    id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """List items in a specific watchlist owned by the current user."""
    watchlist = _get_watchlist_or_404(db, id, user)

    out = []
    quotes_for_portfolio = []

    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote))
        if quote is not None:
            quotes_for_portfolio.append(quote)

    # Evaluate portfolio-level rule
    portfolio_result = change_detection.evaluate_portfolio(quotes_for_portfolio)

    # If portfolio rule fired, add it as a special attention item
    if portfolio_result["attention"]:
        # Create a synthetic watchlist item for the portfolio signal
        portfolio_item = WatchlistItemOut(
            id=-1,  # Special ID to indicate portfolio-level item
            symbol="PORTFOLIO",
            note=None,
            company_name="Portfolio-wide signal",
            company_website=None,
            added_at=datetime.datetime.utcnow(),
            added_price=None,
            last_viewed_at=None,
            price_at_last_view=None,
            quote=None,
            change_since_added_pct=None,
            change_since_last_view_pct=None,
            fired=[FiredRule(**f) for f in portfolio_result["fired"]],
            attention_score=portfolio_result["score"],
            has_attention=True,
        )
        out.append(portfolio_item)

    out.sort(key=lambda w: w.attention_score, reverse=True)
    return out


@watchlists_router.post("/{id}/items", response_model=WatchlistItemOut)
def add_watchlist_item(
    id: int,
    payload: WatchlistItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add an item to a specific watchlist owned by the current user."""
    watchlist = _get_watchlist_or_404(db, id, user)
    
    symbol = payload.symbol.strip().upper()
    if not symbol:
        raise HTTPException(400, "symbol is required")
    if not SYMBOL_RE.match(symbol):
        raise HTTPException(400, f"'{symbol}' doesn't look like a valid ticker")

    existing = next((i for i in watchlist.items if i.symbol == symbol), None)
    if existing:
        raise HTTPException(409, f"{symbol} is already on your watchlist")

    quote = db.get(SymbolQuote, symbol)
    if quote is None:
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
    website = lookup_company_website(symbol)

    item = WatchlistItem(
        watchlist_id=watchlist.id,
        symbol=symbol,
        note=payload.note,
        company_name=payload.company_name.strip() if payload.company_name else None,
        company_website=website,
        added_price=added_price,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"{symbol} is already on your watchlist")
    db.refresh(item)

    return _serialize(item, quote)


@watchlists_router.patch("/{id}/items/{item_id}", response_model=WatchlistItemOut)
def update_watchlist_item_note(
    id: int,
    item_id: int,
    payload: WatchlistItemNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the note on an item in a specific watchlist."""
    watchlist = _get_watchlist_or_404(db, id, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")

    item.note = payload.note
    db.commit()
    db.refresh(item)

    quote = db.get(SymbolQuote, item.symbol)
    return _serialize(item, quote)


@watchlists_router.delete("/{id}/items/{item_id}")
def remove_watchlist_item(
    id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Remove an item from a specific watchlist."""
    watchlist = _get_watchlist_or_404(db, id, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@watchlists_router.post("/{id}/items/{item_id}/seen", response_model=WatchlistItemOut)
def mark_watchlist_item_seen(
    id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Mark an item in a specific watchlist as seen."""
    watchlist = _get_watchlist_or_404(db, id, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")

    quote = db.get(SymbolQuote, item.symbol)
    item.last_viewed_at = datetime.datetime.utcnow()
    item.price_at_last_view = quote.price if quote else None
    if quote is not None:
        current_keys = change_detection.evaluate(None, quote)["keys"]
        item.fired_rules_at_last_view = json.dumps(current_keys)
    else:
        item.fired_rules_at_last_view = None

    db.add(
        SeenEvent(
            user_id=user.id,
            symbol=item.symbol,
            company_name=item.company_name,
            seen_at=item.last_viewed_at,
            price_at_seen=item.price_at_last_view,
        )
    )
    db.commit()
    db.refresh(item)

    return _serialize(item, quote)


@watchlists_router.get("/{id}/digest")
def get_watchlist_digest(
    id: int,
    symbol: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a digest for a specific watchlist.
    
    Optional `symbol` narrows the facts handed to the LLM to one stock.
    """
    items = list_watchlist_items(id, db, user)
    fired_facts = [
        {"symbol": i.symbol, "fired": [f.model_dump() for f in i.fired]}
        for i in items
        if i.has_attention and (symbol is None or i.symbol == symbol.strip().upper())
    ]
    return {"digest": generate_digest(fired_facts)}


@watchlists_router.get("/{id}/benchmark")
def get_watchlist_benchmark(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get benchmark comparison for a specific watchlist."""
    watchlist = _get_watchlist_or_404(db, id, user)
    
    benchmark = db.get(SymbolQuote, BENCHMARK_SYMBOL)
    _sanitize_quote(benchmark)
    benchmark_pct = None
    if benchmark and benchmark.price is not None and benchmark.prev_close:
        benchmark_pct = (benchmark.price - benchmark.prev_close) / benchmark.prev_close

    day_pcts = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        _sanitize_quote(quote)
        if quote and quote.price is not None and quote.prev_close:
            day_pcts.append((quote.price - quote.prev_close) / quote.prev_close)

    watchlist_pct = sum(day_pcts) / len(day_pcts) if day_pcts else None
    outperformance_pct = (
        watchlist_pct - benchmark_pct if watchlist_pct is not None and benchmark_pct is not None else None
    )

    return {
        "benchmark_symbol": BENCHMARK_SYMBOL,
        "benchmark_label": "Nifty 50",
        "benchmark_pct": benchmark_pct,
        "watchlist_pct": watchlist_pct,
        "outperformance_pct": outperformance_pct,
    }


@watchlists_router.get("/{id}/history", response_model=list[HistoryEventOut])
def get_watchlist_history(
    id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Get history for items in a specific watchlist."""
    watchlist = _get_watchlist_or_404(db, id, user)
    
    # Get all symbols in this watchlist
    watchlist_symbols = {item.symbol for item in watchlist.items}
    
    events = (
        db.query(SeenEvent)
        .filter_by(user_id=user.id)
        .filter(SeenEvent.symbol.in_(watchlist_symbols))
        .order_by(SeenEvent.seen_at.desc())
        .limit(30)
        .all()
    )

    out = []
    for e in events:
        quote = db.get(SymbolQuote, e.symbol)
        _sanitize_quote(quote)
        change_since_pct = None
        if quote and quote.price is not None and e.price_at_seen:
            change_since_pct = (quote.price - e.price_at_seen) / e.price_at_seen
        out.append(
            HistoryEventOut(
                id=e.id,
                symbol=e.symbol,
                company_name=e.company_name,
                seen_at=e.seen_at,
                price_at_seen=e.price_at_seen,
                current_price=quote.price if quote else None,
                currency=quote.currency if quote else None,
                change_since_pct=change_since_pct,
            )
        )
    return out


@watchlists_router.post("/{id}/reset", response_model=list[WatchlistItemOut])
def reset_watchlist_to_sample(
    id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Reset a specific watchlist to the sample set."""
    watchlist = _get_watchlist_or_404(db, id, user)
    
    for item in list(watchlist.items):
        db.delete(item)
    db.flush()
    db.expire(watchlist, ["items"])
    seed_default_watchlist(db, watchlist)
    db.commit()

    out = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote))
    out.sort(key=lambda w: w.attention_score, reverse=True)
    return out


# ============================================================================
# EXISTING SINGLE-WATCHLIST ROUTES (unchanged, resolve to default watchlist)
# ============================================================================

@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    watchlist = get_or_create_watchlist_for_user(db, user)
    db.commit()

    out = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote))

    out.sort(key=lambda w: w.attention_score, reverse=True)
    return out


@router.get("/digest")
def get_digest(
    symbol: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """On-demand only (see services/digest.py for why) -- reuses the same
    rule evaluation as list_watchlist rather than recomputing it, so this
    endpoint can never see a different set of "fired" facts than what the
    UI already shows.

    Optional `symbol` narrows the facts handed to the LLM to one stock, for
    the per-stock "Explain this" in the detail drawer -- purely a filter on
    what's sent, same rule-computed facts, same prompt. Omitting it keeps
    the original whole-feed behavior unchanged.
    """
    items = list_watchlist(db, user)
    fired_facts = [
        {"symbol": i.symbol, "fired": [f.model_dump() for f in i.fired]}
        for i in items
        if i.has_attention and (symbol is None or i.symbol == symbol.strip().upper())
    ]
    return {"digest": generate_digest(fired_facts)}


@router.get("/history", response_model=list[HistoryEventOut])
def get_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """A real timeline of your own attention: every time you've marked a
    symbol seen, what it was trading at, and what it's done since. This is
    Drift's "remembers where you were" idea made literal and browsable,
    not a placeholder nav section -- it reads real SeenEvent rows, no
    fabricated history.
    """
    events = (
        db.query(SeenEvent).filter_by(user_id=user.id).order_by(SeenEvent.seen_at.desc()).limit(30).all()
    )

    out = []
    for e in events:
        quote = db.get(SymbolQuote, e.symbol)
        _sanitize_quote(quote)
        change_since_pct = None
        if quote and quote.price is not None and e.price_at_seen:
            change_since_pct = (quote.price - e.price_at_seen) / e.price_at_seen
        out.append(
            HistoryEventOut(
                id=e.id,
                symbol=e.symbol,
                company_name=e.company_name,
                seen_at=e.seen_at,
                price_at_seen=e.price_at_seen,
                current_price=quote.price if quote else None,
                currency=quote.currency if quote else None,
                change_since_pct=change_since_pct,
            )
        )
    return out


@router.get("/benchmark")
def get_benchmark(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """A second, independent definition of "meaningful" alongside the
    per-symbol rules: not just "unusual for this stock," but "unusual
    relative to the market." Fixed to Nifty 50 -- a real simplification for
    a US-heavy watchlist, disclosed in ENGINEERING_DECISIONS.md rather than
    silently assumed to be the right benchmark for every symbol.

    Reads only from the cache the poller already maintains -- no live
    yfinance call on this request path, same rule as everywhere else.
    """
    benchmark = db.get(SymbolQuote, BENCHMARK_SYMBOL)
    _sanitize_quote(benchmark)
    benchmark_pct = None
    if benchmark and benchmark.price is not None and benchmark.prev_close:
        benchmark_pct = (benchmark.price - benchmark.prev_close) / benchmark.prev_close

    watchlist = get_or_create_watchlist_for_user(db, user)
    db.commit()

    day_pcts = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        _sanitize_quote(quote)
        if quote and quote.price is not None and quote.prev_close:
            day_pcts.append((quote.price - quote.prev_close) / quote.prev_close)

    watchlist_pct = sum(day_pcts) / len(day_pcts) if day_pcts else None
    outperformance_pct = (
        watchlist_pct - benchmark_pct if watchlist_pct is not None and benchmark_pct is not None else None
    )

    return {
        "benchmark_symbol": BENCHMARK_SYMBOL,
        "benchmark_label": "Nifty 50",
        "benchmark_pct": benchmark_pct,
        "watchlist_pct": watchlist_pct,
        "outperformance_pct": outperformance_pct,
    }


@router.post("/reset", response_model=list[WatchlistItemOut])
def reset_to_sample(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Clears the caller's current watchlist and repopulates it with the
    curated sample set -- lets a demo/exploration session always get back
    to a clean, populated starting point rather than staying empty or
    cluttered after experimenting. Available to any account, not demo-only.
    """
    watchlist = get_or_create_watchlist_for_user(db, user)
    for item in list(watchlist.items):
        db.delete(item)
    db.flush()
    # deleting children directly (rather than via watchlist.items.remove())
    # doesn't refresh the parent's in-memory `items` collection -- without
    # this, seed_default_watchlist's "already on the list?" check would see
    # the just-deleted objects still sitting in that stale collection and
    # skip re-adding them, silently dropping symbols from the reset result.
    db.expire(watchlist, ["items"])
    seed_default_watchlist(db, watchlist)
    db.commit()

    out = []
    for item in watchlist.items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote))
    out.sort(key=lambda w: w.attention_score, reverse=True)
    return out


@router.post("", response_model=WatchlistItemOut)
def add_symbol(
    payload: WatchlistItemCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    watchlist = get_or_create_watchlist_for_user(db, user)
    symbol = payload.symbol.strip().upper()
    if not symbol:
        raise HTTPException(400, "symbol is required")
    if not SYMBOL_RE.match(symbol):
        raise HTTPException(400, f"'{symbol}' doesn't look like a valid ticker")

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
    # same best-effort capture as company_name: never blocks the add
    website = lookup_company_website(symbol)

    item = WatchlistItem(
        watchlist_id=watchlist.id,
        symbol=symbol,
        note=payload.note,
        company_name=payload.company_name.strip() if payload.company_name else None,
        company_website=website,
        added_price=added_price,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        # two concurrent adds of the same new symbol raced past the
        # check above -- the unique constraint is the real guard, this
        # just turns it into the same clean 409 instead of a 500
        db.rollback()
        raise HTTPException(409, f"{symbol} is already on your watchlist")
    db.refresh(item)

    return _serialize(item, quote)


@router.patch("/{item_id}", response_model=WatchlistItemOut)
def update_note(
    item_id: int,
    payload: WatchlistItemNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Updates the thesis/reason text after a symbol's already been added --
    previously the only way to set it was at creation time. Additive
    endpoint; doesn't change any existing route's contract.
    """
    watchlist = get_or_create_watchlist_for_user(db, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")

    item.note = payload.note
    db.commit()
    db.refresh(item)

    quote = db.get(SymbolQuote, item.symbol)
    return _serialize(item, quote)


@router.delete("/{item_id}")
def remove_symbol(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    watchlist = get_or_create_watchlist_for_user(db, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/seen", response_model=WatchlistItemOut)
def mark_seen(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Explicit 'I looked at this' action — the only thing that moves
    last_viewed_at / price_at_last_view forward. Never done implicitly by a
    background poll or a page load. See PROJECT_BRIEF.md §3.

    Also snapshots which structural rules (unusual volume, 52-week
    proximity) are true right now -- those aren't anchored to
    price_at_last_view the way price_move is, so without this snapshot
    they'd fire again on every single refresh regardless of whether
    anything actually changed, and "mark as seen" would visibly do nothing.
    """
    watchlist = get_or_create_watchlist_for_user(db, user)
    item = next((i for i in watchlist.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "not found")

    quote = db.get(SymbolQuote, item.symbol)
    item.last_viewed_at = datetime.datetime.utcnow()
    item.price_at_last_view = quote.price if quote else None
    if quote is not None:
        current_keys = change_detection.evaluate(None, quote)["keys"]
        item.fired_rules_at_last_view = json.dumps(current_keys)
    else:
        item.fired_rules_at_last_view = None

    db.add(
        SeenEvent(
            user_id=user.id,
            symbol=item.symbol,
            company_name=item.company_name,
            seen_at=item.last_viewed_at,
            price_at_seen=item.price_at_last_view,
        )
    )
    db.commit()
    db.refresh(item)

    return _serialize(item, quote)
