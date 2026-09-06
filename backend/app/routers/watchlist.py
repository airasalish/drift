import datetime
import json
import math
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_user import get_or_create_watchlist_for_user, seed_default_watchlist, WATCHLIST_TEMPLATES
from app.models import SeenEvent, SymbolQuote, SymbolSector, User, Watchlist, WatchlistItem
from app.sector_data import get_sector_for_symbol, get_symbols_in_sector, seed_sector_data
from app.schemas import (
    BulkImportAnalyze,
    BulkImportConfirm,
    BulkImportResult,
    ChartRangeOut,
    DriftyOut,
    DriftyRankedItem,
    DriftyWatchlistOut,
    FiredRule,
    HistoryEventOut,
    MarketAnalysisOut,
    PeerAnalysisOut,
    QuoteOut,
    RelatedStockOut,
    SelfAnalysisOut,
    SimilarMoveOut,
    SimilarMovesOut,
    StockMembershipOut,
    WatchlistCreate,
    WatchlistItemCreate,
    WatchlistItemNoteUpdate,
    WatchlistItemOut,
    WatchlistOut,
    WatchlistTemplateCreate,
    WatchlistTemplateOut,
    WatchlistUpdate,
)
from app.services import change_detection
from app.services.auth import get_current_user
from app.services.digest import generate_digest
from app.services.market_data import fetch_symbol_stats, fetch_chart_data, lookup_company_website
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


def _serialize(item: WatchlistItem, quote: SymbolQuote | None, user: User) -> WatchlistItemOut:
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
        result = change_detection.evaluate(item.price_at_last_view, quote, previously_fired, user.sensitivity)
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
    """List all watchlists belonging to the current user with item counts."""
    from sqlalchemy import func

    # Efficient single query to get watchlists with item counts (no N+1)
    watchlists = (
        db.query(
            Watchlist.id,
            Watchlist.name,
            Watchlist.created_at,
            func.count(WatchlistItem.id).label("item_count"),
        )
        .outerjoin(WatchlistItem, Watchlist.id == WatchlistItem.watchlist_id)
        .filter(Watchlist.user_id == user.id)
        .group_by(Watchlist.id, Watchlist.name, Watchlist.created_at)
        .order_by(Watchlist.created_at)
        .all()
    )

    return [
        WatchlistOut(id=w.id, name=w.name, created_at=w.created_at, item_count=w.item_count or 0)
        for w in watchlists
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

    return WatchlistOut(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at, item_count=0)


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

    return WatchlistOut(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at, item_count=len(watchlist.items))


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
# WATCHLIST TEMPLATES
# ============================================================================

TEMPLATE_METADATA = {
    "technology": {"display_name": "Technology", "description": "Major US tech companies"},
    "ai_semiconductors": {"display_name": "AI & Semiconductors", "description": "AI infrastructure and chip makers"},
    "indian_large_caps": {"display_name": "Indian Large Caps", "description": "Major Indian companies"},
    "us_mega_caps": {"display_name": "US Mega Caps", "description": "Largest US companies by market cap"},
    "banking": {"display_name": "Banking", "description": "Major financial institutions"},
    "ev_mobility": {"display_name": "EV & Mobility", "description": "Electric vehicle and mobility companies"},
    "nifty_50": {"display_name": "Nifty 50", "description": "Major NSE-listed index constituents"},
    "pharma": {"display_name": "Pharma", "description": "Major pharmaceutical companies"},
    "dividends": {"display_name": "Dividends", "description": "Stocks with consistent dividend payouts"},
}


@watchlists_router.get("/templates", response_model=list[WatchlistTemplateOut])
def list_watchlist_templates():
    """List available watchlist templates."""
    return [
        WatchlistTemplateOut(
            template_name=key,
            display_name=value["display_name"],
            description=value["description"],
            symbol_count=len(WATCHLIST_TEMPLATES[key]),
        )
        for key, value in TEMPLATE_METADATA.items()
    ]


@watchlists_router.post("/templates/create", response_model=WatchlistOut)
def create_watchlist_from_template(
    payload: WatchlistTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new watchlist from a template and populate it with the template's symbols."""
    if payload.template_name not in WATCHLIST_TEMPLATES:
        raise HTTPException(404, f"template '{payload.template_name}' not found")

    template_symbols = WATCHLIST_TEMPLATES[payload.template_name]

    # Create the watchlist
    watchlist = Watchlist(user_id=user.id, name=payload.watchlist_name.strip())
    db.add(watchlist)
    db.flush()

    # Add each symbol from the template using the existing add logic
    for symbol, company_name, note in template_symbols:
        quote = db.get(SymbolQuote, symbol)
        if quote is None:
            stats = fetch_symbol_stats(symbol)
            if stats is None:
                continue  # Skip if symbol can't be resolved
            spark_closes = stats.pop("spark_closes")
            similar_moves = stats.pop("similar_moves", [])
            quote = SymbolQuote(symbol=symbol, watch_count=0, fetch_ok=True, **stats)
            quote.spark_closes_json = json.dumps(spark_closes)
            quote.similar_moves_json = json.dumps(similar_moves)
            quote.fetched_at = datetime.datetime.utcnow()
            db.add(quote)
            db.flush()

        added_price = quote.price
        website = lookup_company_website(symbol)

        item = WatchlistItem(
            watchlist_id=watchlist.id,
            symbol=symbol,
            note=note,
            company_name=company_name,
            company_website=website,
            added_price=added_price,
        )
        db.add(item)

    db.commit()
    db.refresh(watchlist)

    return WatchlistOut(id=watchlist.id, name=watchlist.name, created_at=watchlist.created_at, item_count=len(watchlist.items))


# ============================================================================
# BULK IMPORT
# ============================================================================

MAX_IMPORT_SYMBOLS = 50


@watchlists_router.post("/import/analyze", response_model=BulkImportResult)
def analyze_bulk_import(
    payload: BulkImportAnalyze,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Analyze bulk import text to validate symbols and check for duplicates."""
    watchlist = _get_watchlist_or_404(db, payload.watchlist_id, user)

    # Parse symbols from text (handle newlines, commas, whitespace)
    raw_symbols = re.split(r"[\n,\s]+", payload.text.strip())
    parsed_symbols = [s.strip().upper() for s in raw_symbols if s.strip()]

    if len(parsed_symbols) > MAX_IMPORT_SYMBOLS:
        raise HTTPException(400, f"maximum {MAX_IMPORT_SYMBOLS} symbols per import")

    # De-duplicate
    unique_symbols = list(dict.fromkeys(parsed_symbols))  # Preserve order while de-duplicating

    # Get existing symbols in this watchlist
    existing_symbols = {item.symbol for item in watchlist.items}

    valid = []
    duplicates = []
    invalid = []

    for symbol in unique_symbols:
        # Check if already in watchlist
        if symbol in existing_symbols:
            duplicates.append(symbol)
            continue

        # Validate symbol format
        if not SYMBOL_RE.match(symbol):
            invalid.append(symbol)
            continue

        # Check if symbol can be resolved (fetch market data)
        quote = db.get(SymbolQuote, symbol)
        if quote is None:
            # Try to fetch market data to validate
            stats = fetch_symbol_stats(symbol)
            if stats is None:
                invalid.append(symbol)
                continue
            # Symbol is valid, but we don't add it yet (that's the confirm step)
            valid.append(symbol)
        else:
            # Symbol exists in cache, so it's valid
            valid.append(symbol)

    return BulkImportResult(
        valid=valid,
        duplicates=duplicates,
        invalid=invalid,
        total_parsed=len(parsed_symbols),
    )


@watchlists_router.post("/import/confirm", response_model=list[WatchlistItemOut])
def confirm_bulk_import(
    payload: BulkImportConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirm and execute bulk import of validated symbols."""
    watchlist = _get_watchlist_or_404(db, payload.watchlist_id, user)

    if len(payload.symbols) > MAX_IMPORT_SYMBOLS:
        raise HTTPException(400, f"maximum {MAX_IMPORT_SYMBOLS} symbols per import")

    added_items = []

    for symbol in payload.symbols:
        # Check if already exists (shouldn't happen if analyzed first, but safety check)
        existing = next((i for i in watchlist.items if i.symbol == symbol), None)
        if existing:
            continue

        quote = db.get(SymbolQuote, symbol)
        if quote is None:
            # Fetch market data for new symbol
            stats = fetch_symbol_stats(symbol)
            if stats is None:
                continue  # Skip if symbol can't be resolved
            spark_closes = stats.pop("spark_closes")
            similar_moves = stats.pop("similar_moves", [])
            quote = SymbolQuote(symbol=symbol, watch_count=0, fetch_ok=True, **stats)
            quote.spark_closes_json = json.dumps(spark_closes)
            quote.similar_moves_json = json.dumps(similar_moves)
            quote.fetched_at = datetime.datetime.utcnow()
            db.add(quote)
            db.flush()

        added_price = quote.price
        website = lookup_company_website(symbol)

        item = WatchlistItem(
            watchlist_id=watchlist.id,
            symbol=symbol,
            note=None,  # Bulk import doesn't include notes
            company_name=None,  # Will be filled by future lookup if needed
            company_website=website,
            added_price=added_price,
        )
        db.add(item)
        db.flush()
        added_items.append(item)

    db.commit()

    # Return the newly added items
    out = []
    for item in added_items:
        quote = db.get(SymbolQuote, item.symbol)
        out.append(_serialize(item, quote, user))

    return out


# ============================================================================
# RELATED STOCKS (SAME-SECTOR)
# ============================================================================

@watchlists_router.get("/related/{symbol}", response_model=list[RelatedStockOut])
def get_related_stocks(
    symbol: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get stocks in the same sector as the given symbol from tracked symbols."""
    symbol = symbol.upper()
    sector = get_sector_for_symbol(symbol)

    if sector is None:
        return []  # No sector data for this symbol

    # Get all symbols in the same sector
    sector_symbols = get_symbols_in_sector(sector)

    # Filter to symbols that are actually in any of the user's watchlists
    user_watchlists = db.query(Watchlist).filter_by(user_id=user.id).all()
    tracked_symbols = set()
    for watchlist in user_watchlists:
        for item in watchlist.items:
            tracked_symbols.add(item.symbol)

    # Return symbols in the same sector that are also tracked
    related = []
    for related_symbol in sector_symbols:
        if related_symbol == symbol:
            continue  # Don't include the symbol itself
        if related_symbol in tracked_symbols:
            quote = db.get(SymbolQuote, related_symbol)
            if quote:
                # Get company name from watchlist item if available
                company_name = None
                for watchlist in user_watchlists:
                    for item in watchlist.items:
                        if item.symbol == related_symbol:
                            company_name = item.company_name
                            break
                    if company_name:
                        break

                related.append(
                    RelatedStockOut(
                        symbol=related_symbol,
                        company_name=company_name,
                        sector=sector,
                    )
                )

    return related


# ============================================================================
# SIMILAR MOVES
# ============================================================================

@watchlists_router.get("/similar-moves/{symbol}", response_model=SimilarMovesOut)
def get_similar_moves(
    symbol: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Find historical days with similar % moves to today's move."""
    symbol = symbol.upper()
    quote = db.get(SymbolQuote, symbol)

    if quote is None or quote.price is None or quote.prev_close is None:
        raise HTTPException(404, f"no data available for '{symbol}'")

    # Calculate today's % change
    today_pct_change = (quote.price - quote.prev_close) / quote.prev_close

    # Load similar moves data
    similar_moves_data = []
    if quote.similar_moves_json:
        try:
            similar_moves_data = json.loads(quote.similar_moves_json)
        except (TypeError, ValueError):
            similar_moves_data = []

    # Find similar historical moves (within 20% of today's move magnitude)
    similar_days = []
    tolerance = 0.2  # 20% tolerance
    move_magnitude = abs(today_pct_change)

    for move in similar_moves_data:
        if abs(move["pct_change"]) >= move_magnitude * (1 - tolerance) and abs(move["pct_change"]) <= move_magnitude * (1 + tolerance):
            try:
                move_date = datetime.datetime.strptime(move["date"], "%Y-%m-%d")
                similar_days.append(
                    SimilarMoveOut(
                        date=move_date,
                        pct_change=move["pct_change"],
                    )
                )
            except (ValueError, TypeError):
                continue

    # Sort by closest to today's move magnitude and return up to 3
    similar_days.sort(key=lambda x: abs(x.pct_change - today_pct_change))
    similar_days = similar_days[:3]

    if len(similar_days) < 2:
        return SimilarMovesOut(
            symbol=symbol,
            today_pct_change=today_pct_change,
            similar_moves=[],
            message="not enough historical data yet",
        )

    return SimilarMovesOut(
        symbol=symbol,
        today_pct_change=today_pct_change,
        similar_moves=similar_days,
        message=None,
    )


# ============================================================================
# CHART RANGES
# ============================================================================

@watchlists_router.get("/chart/{symbol}/{range_name}", response_model=ChartRangeOut)
def get_chart_range(
    symbol: str,
    range_name: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get chart data for a specific time range.

    Range options: "1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"
    All data is daily granularity (no intraday).
    Returns OHLC data where available, degrades to close-only if not.
    """
    symbol = symbol.upper()

    # Validate that symbol is in user's watchlists (optional, but good practice)
    user_watchlists = db.query(Watchlist).filter_by(user_id=user.id).all()
    tracked_symbols = set()
    for watchlist in user_watchlists:
        for item in watchlist.items:
            tracked_symbols.add(item.symbol)

    if symbol not in tracked_symbols:
        raise HTTPException(404, f"symbol '{symbol}' not in your watchlists")

    chart_data = fetch_chart_data(symbol, range_name)
    if chart_data is None:
        raise HTTPException(422, f"couldn't fetch chart data for '{symbol}' with range '{range_name}'")

    # Convert date strings to datetime objects, dropping any point whose date
    # fails to parse -- paired with its close, not left as a null in a
    # non-optional list (dates/closes must stay the same length or the chart
    # misaligns its own x-axis from its y-values).
    dates = []
    closes = []
    opens = []
    highs = []
    lows = []
    volumes = []

    for idx, date_str in enumerate(chart_data["dates"]):
        try:
            parsed = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        dates.append(parsed)
        closes.append(chart_data["closes"][idx])

        # Handle optional OHLC/volume data
        if "opens" in chart_data and chart_data["opens"]:
            opens.append(chart_data["opens"][idx])
        if "highs" in chart_data and chart_data["highs"]:
            highs.append(chart_data["highs"][idx])
        if "lows" in chart_data and chart_data["lows"]:
            lows.append(chart_data["lows"][idx])
        if "volumes" in chart_data and chart_data["volumes"]:
            volumes.append(chart_data["volumes"][idx])

    return ChartRangeOut(
        symbol=symbol,
        range_name=range_name,
        dates=dates,
        closes=closes,
        opens=opens if opens else None,
        highs=highs if highs else None,
        lows=lows if lows else None,
        volumes=volumes if volumes else None,
        currency=chart_data["currency"],
    )


# ============================================================================
# MULTI-WATCHLIST STOCK MEMBERSHIP
# ============================================================================

@watchlists_router.get("/stock/{symbol}/memberships", response_model=StockMembershipOut)
def get_stock_memberships(
    symbol: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get all watchlists that contain a specific symbol.

    This endpoint helps users understand where a particular stock is tracked
    across all their watchlists. This is useful for multi-watchlist workflows
    where a stock might be in multiple watchlists (e.g., one for trading,
    one for long-term holdings).

    Args:
        symbol: Stock symbol (case-insensitive)
        db: Database session
        user: Authenticated user

    Returns:
        StockMembershipOut with:
        - symbol: The requested symbol (uppercased)
        - company_name: Company name if found in any watchlist
        - memberships: List of {watchlist_id, name} for each watchlist containing the symbol

    Note:
        Returns empty memberships list if symbol is not in any watchlist.
        Does not raise 404 for missing symbols - always returns valid structure.
    """
    symbol = symbol.upper()

    # Get all watchlists for the current user
    user_watchlists = db.query(Watchlist).filter_by(user_id=user.id).all()

    memberships = []
    company_name = None

    for watchlist in user_watchlists:
        for item in watchlist.items:
            if item.symbol == symbol:
                memberships.append({"watchlist_id": watchlist.id, "name": watchlist.name})
                if company_name is None:
                    company_name = item.company_name
                break

    return StockMembershipOut(
        symbol=symbol,
        company_name=company_name,
        memberships=memberships,
    )


@watchlists_router.delete("/{id}/items/{symbol}")
def remove_watchlist_item_by_symbol(
    id: int,
    symbol: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a stock from a watchlist by symbol.

    This is an alternative to the item_id-based removal endpoint. It's more
    convenient when you have the symbol but not the item ID.

    Important: This only removes the stock from the specified watchlist.
    The stock may still exist in other watchlists. This is intentional for
    multi-watchlist workflows.

    Args:
        id: Watchlist ID
        symbol: Stock symbol to remove (case-insensitive)
        db: Database session
        user: Authenticated user

    Returns:
        {"ok": true} on success

    Raises:
        HTTPException 404: Symbol not found in the watchlist
        HTTPException 404: Watchlist doesn't exist or user doesn't own it
    """
    watchlist = _get_watchlist_or_404(db, id, user)
    symbol = symbol.upper()

    item = next((i for i in watchlist.items if i.symbol == symbol), None)
    if item is None:
        raise HTTPException(404, f"symbol '{symbol}' not found in watchlist")

    db.delete(item)
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
        out.append(_serialize(item, quote, user))
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
        similar_moves = stats.pop("similar_moves", [])
        quote = SymbolQuote(symbol=symbol, watch_count=0, fetch_ok=True, **stats)
        quote.spark_closes_json = json.dumps(spark_closes)
        quote.similar_moves_json = json.dumps(similar_moves)
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

    return _serialize(item, quote, user)


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
    return _serialize(item, quote, user)


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
        current_keys = change_detection.evaluate(None, quote, sensitivity=user.sensitivity)["keys"]
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

    return _serialize(item, quote, user)


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


# ============================================================================
# DRIFTY INTELLIGENCE ENGINE
# ============================================================================

def detect_cluster(watchlist_items: list[WatchlistItem], db: Session) -> dict | None:
    """Detect if 3+ stocks are moving >2% in the same direction.

    This function identifies market-wide movements by clustering stocks that
    are all moving significantly in the same direction. This helps distinguish
    between stock-specific events and sector/market-wide trends.

    Algorithm:
    1. For each stock in the watchlist, calculate its daily percentage change
    2. Group stocks by direction (up/down) if move magnitude >= 2%
    3. If any direction group has >= 3 stocks, return cluster information

    Args:
        watchlist_items: List of WatchlistItem objects to analyze
        db: Database session for fetching SymbolQuote data

    Returns:
        dict with cluster info: {"name": str, "symbols": list[str], "trend": str}
        or None if no cluster detected

    Cluster example:
        {
            "name": "market movers",
            "symbols": ["AAPL", "MSFT", "GOOGL"],
            "trend": "up 2.5%+"
        }
    """
    MIN_CLUSTER_MOVE = 0.02  # 2% - threshold for "significant" movement
    MIN_CLUSTER_SIZE = 3  # Minimum stocks to qualify as a cluster

    direction_groups = {"up": [], "down": []}

    for item in watchlist_items:
        quote = db.get(SymbolQuote, item.symbol)
        if not quote:
            continue

        # Validate quote data
        if not quote.price or not quote.prev_close or quote.prev_close <= 0:
            continue

        day_pct = (quote.price - quote.prev_close) / quote.prev_close

        # Only include stocks with significant movement
        if abs(day_pct) >= MIN_CLUSTER_MOVE:
            if day_pct > 0:
                direction_groups["up"].append((item.symbol, day_pct))
            else:
                direction_groups["down"].append((item.symbol, day_pct))

    # Check if any direction has enough symbols to form a cluster
    for direction, symbols_moves in direction_groups.items():
        if len(symbols_moves) >= MIN_CLUSTER_SIZE:
            avg_move = sum(move for _, move in symbols_moves) / len(symbols_moves)
            symbols_list = [sym for sym, _ in symbols_moves]
            return {
                "name": "market movers",
                "symbols": symbols_list,
                "trend": f"{'up' if avg_move > 0 else 'down'} {abs(avg_move * 100):.1f}%+",
            }

    return None


def compute_drifty(watchlist_id: int, symbol: str, user: User, db: Session) -> DriftyOut:
    """Compute the intelligence layer for a stock within a watchlist context.

    Drifty Intelligence Engine analyzes a stock across three dimensions:
    1. Self Analysis: How unusual is this stock's movement compared to its own history?
    2. Peer Analysis: How does this stock compare to other stocks in the same watchlist?
    3. Market Analysis: How does this stock perform relative to the market benchmark?

    The engine combines these signals into a single attention score (0-100) that
    ranks stocks by how "interesting" they are. All thresholds are named and auditable.

    Scoring Algorithm:
    - Move unusual for this stock (>= change_detection.unusual_move_threshold): +30 points
    - Outlier in watchlist (different direction from majority): +25 points
    - Market out/underperformance > 1.5%: +20 points
    - Part of a market cluster: +15 points
    - Volume spike >= change_detection.VOLUME_SPIKE_MULTIPLE: +15 points
    - At a 52-week high/low: +20 points, within change_detection.NEAR_52W_PCT of one: +12 points

    The move, volume and 52-week thresholds are the same named constants
    change_detection.evaluate() uses, so the Charts view's Drifty panel and
    the watchlist's attention flags answer "is this unusual" identically.
    Drifty is a stateless per-request read, so it reports 52-week and volume
    facts as they currently stand -- change_detection's "previously fired"
    suppression (what makes mark-as-seen work) stays where it is.

    Args:
        watchlist_id: ID of the watchlist to analyze within
        symbol: Stock symbol to analyze (will be uppercased)
        user: Current user for authorization
        db: Database session

    Returns:
        DriftyOut object with analysis results and attention score

    Raises:
        HTTPException: 404 if stock has no market data
        HTTPException: 404 if watchlist doesn't exist or user doesn't own it
    """
    # Validate and fetch quote data
    symbol = symbol.upper()
    quote = db.get(SymbolQuote, symbol)
    if not quote or quote.price is None:
        raise HTTPException(404, f"no market data for symbol '{symbol}'")

    # Validate watchlist ownership
    watchlist = _get_watchlist_or_404(db, watchlist_id, user)

    # Validate symbol is in watchlist
    if not any(item.symbol == symbol for item in watchlist.items):
        raise HTTPException(404, f"symbol '{symbol}' not in watchlist")

    # ============================================================================
    # SELF ANALYSIS
    # Compare today's move against the stock's own volatility
    # ============================================================================
    # Calculate today's percentage change with division by zero protection
    if quote.prev_close and quote.prev_close > 0:
        today_pct = (quote.price - quote.prev_close) / quote.prev_close
    else:
        today_pct = 0.0

    # Get normal daily move (20-day average), with fallback to 1%
    # Handle both None and 0 values
    if quote.avg_daily_move_pct_20d and quote.avg_daily_move_pct_20d > 0:
        normal_move = quote.avg_daily_move_pct_20d
    else:
        normal_move = 0.01

    # Calculate move magnitude (how many times larger than normal)
    # Protected against division by zero
    if normal_move > 0:
        self_move_magnitude = abs(today_pct) / normal_move
    else:
        self_move_magnitude = 0.0

    # The one definition of "unusual for this stock", shared with the
    # watchlist's attention flags rather than restated as a second number
    # Uses the user's sensitivity setting to adjust the threshold
    move_threshold = change_detection.unusual_move_threshold(quote.avg_daily_move_pct_20d, user.sensitivity)

    # Calculate volume ratio (today's volume vs 20-day average)
    volume_vs_normal = 0.0
    if quote.volume and quote.avg_volume_20d and quote.avg_volume_20d > 0:
        volume_vs_normal = quote.volume / quote.avg_volume_20d

    # ============================================================================
    # PEER ANALYSIS
    # Compare against other stocks in the same watchlist
    # ============================================================================
    peer_quotes = []
    for item in watchlist.items:
        if item.symbol != symbol:
            q = db.get(SymbolQuote, item.symbol)
            if q and q.price is not None:
                peer_quotes.append(q)

    # Count how many peers moved in the same direction
    same_direction = 0
    peer_moves = []
    for q in peer_quotes:
        # Calculate peer's daily change with protection
        if q.prev_close and q.prev_close > 0:
            peer_pct = (q.price - q.prev_close) / q.prev_close
            peer_moves.append(peer_pct)

            # Check if moving in same direction (both positive or both negative)
            # Handle edge case where today_pct is 0 (shouldn't count as same direction)
            if today_pct != 0 and peer_pct != 0 and (today_pct * peer_pct) > 0:
                same_direction += 1

    # Calculate average peer move with empty list protection
    avg_peer_move = sum(peer_moves) / len(peer_moves) if peer_moves else 0.0

    # Detect if this stock is part of a market-wide cluster
    cluster = detect_cluster(watchlist.items, db)

    # ============================================================================
    # MARKET ANALYSIS
    # Compare against Nifty 50 benchmark
    # ============================================================================
    benchmark = db.get(SymbolQuote, BENCHMARK_SYMBOL)
    benchmark_move = 0.0

    if benchmark and benchmark.price and benchmark.prev_close and benchmark.prev_close > 0:
        benchmark_move = (benchmark.price - benchmark.prev_close) / benchmark.prev_close

    # Calculate outperformance (how much better/worse than market)
    outperformance = today_pct - benchmark_move

    # ============================================================================
    # ATTENTION SCORE CALCULATION
    # Combine signals with weighted thresholds
    # ============================================================================
    score = 0
    reasons = []

    # Signal 1: High move magnitude (stock moving unusually compared to itself)
    if abs(today_pct) >= move_threshold:
        score += 30
        reasons.append(f"Moving {self_move_magnitude:.1f}× its normal daily range")

    # Signal 2: Outlier in watchlist (moving differently from peers)
    # Only meaningful if we have peers to compare against AND the stock's own move is significant
    # This prevents noise where a stock with sub-normal movement gets flagged as an outlier
    # just because peers happened to move in a different direction on a quiet day
    if peer_quotes and abs(today_pct) >= move_threshold and same_direction < len(peer_quotes) / 2:
        score += 25
        reasons.append("Outlier in your watchlist (others moving differently)")

    # Signal 3: Market out/underperformance
    # Threshold: 1.5% difference from benchmark
    if abs(outperformance) > 0.015:
        if outperformance > 0:
            reasons.append(f"Outperforming market by {outperformance * 100:.1f}%")
        else:
            reasons.append(f"Underperforming market by {abs(outperformance) * 100:.1f}%")
        score += 20

    # Signal 4: Part of a market cluster
    if cluster and symbol in cluster.get("symbols", []):
        score += 15
        reasons.append(f"{len(cluster['symbols'])} {cluster['name']} stocks {cluster['trend']}")

    # Signal 5: Volume spike -- same multiple the watchlist's attention flags use
    if volume_vs_normal >= change_detection.VOLUME_SPIKE_MULTIPLE:
        score += 15
        reasons.append(f"Volume is {volume_vs_normal:.1f}× normal")

    # Signal 6: 52-week extremes -- same proximity band the attention flags use
    if quote.week52_high is not None and quote.week52_high > 0:
        if quote.price >= quote.week52_high:
            score += 20
            reasons.append(f"At a new 52-week high ({quote.price:.2f}, was {quote.week52_high:.2f})")
        elif quote.price >= quote.week52_high * (1 - change_detection.NEAR_52W_PCT):
            score += 12
            pct_away = (quote.week52_high - quote.price) / quote.week52_high * 100
            reasons.append(f"Within {pct_away:.1f}% of its 52-week high")

    if quote.week52_low is not None and quote.week52_low > 0:
        if quote.price <= quote.week52_low:
            score += 20
            reasons.append(f"At a new 52-week low ({quote.price:.2f}, was {quote.week52_low:.2f})")
        elif quote.price <= quote.week52_low * (1 + change_detection.NEAR_52W_PCT):
            score += 12
            pct_away = (quote.price - quote.week52_low) / quote.week52_low * 100
            reasons.append(f"Within {pct_away:.1f}% of its 52-week low")

    # Cap score at 100
    final_score = min(score, 100)

    # Build context strings for human readability
    self_context = (
        f"{symbol} is moving {self_move_magnitude:.1f}× its normal daily range"
        if abs(today_pct) >= move_threshold
        else f"{symbol} normal move"
    )

    peer_context = (
        f"{symbol} is {'the outlier' if same_direction < len(peer_quotes) / 2 else 'in line with peers'}. "
        f"Other stocks are {'mostly flat' if abs(avg_peer_move) < 0.01 else f'moving {avg_peer_move * 100:.1f}%'}"
        if peer_quotes
        else "No peers in watchlist"
    )

    market_context = (
        f"{symbol} is {'outperforming' if outperformance > 0 else 'underperforming'} the market by {abs(outperformance) * 100:.1f}%"
        if abs(outperformance) > 0.005
        else f"{symbol} is in line with market"
    )

    return DriftyOut(
        symbol=symbol,
        attention_score=final_score,
        self_analysis=SelfAnalysisOut(
            today_pct_change=today_pct,
            normal_daily_move=normal_move,
            move_magnitude=f"{self_move_magnitude:.1f}× normal",
            volume_vs_normal=volume_vs_normal,
            context=self_context,
        ),
        peer_analysis=PeerAnalysisOut(
            watchlist_size=len(watchlist.items),
            same_direction_count=same_direction,
            avg_peer_move=avg_peer_move,
            comparison=peer_context,
            cluster=cluster,
        ),
        market_analysis=MarketAnalysisOut(
            benchmark_move=benchmark_move,
            outperformance=outperformance,
            context=market_context,
        ),
        why_interesting=reasons,
    )


@watchlists_router.get("/{id}/stock/{symbol}/drifty", response_model=DriftyOut)
def get_drifty_analysis(
    id: int,
    symbol: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get Drifty intelligence analysis for a specific stock in a watchlist.

    This endpoint provides comprehensive intelligence analysis by comparing
    the stock against three dimensions:
    - Self: How unusual is its movement compared to its own history?
    - Peers: How does it compare to other stocks in this watchlist?
    - Market: How does it perform relative to the Nifty 50 benchmark?

    The analysis returns an attention score (0-100) that ranks how "interesting"
    the stock is, along with detailed explanations for why it scored that way.

    Args:
        id: Watchlist ID
        symbol: Stock symbol (case-insensitive)
        db: Database session
        user: Authenticated user

    Returns:
        DriftyOut with:
        - attention_score: 0-100 score
        - self_analysis: Self-comparison metrics
        - peer_analysis: Peer comparison metrics
        - market_analysis: Market comparison metrics
        - why_interesting: List of reasons for the score

    Raises:
        HTTPException 404: Stock not in watchlist or has no market data
        HTTPException 404: Watchlist doesn't exist or user doesn't own it
    """
    return compute_drifty(id, symbol.upper(), user, db)


@watchlists_router.get("/{id}/drifty", response_model=DriftyWatchlistOut)
def get_drifty_watchlist(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get Drifty intelligence ranking for an entire watchlist.

    This endpoint computes Drifty analysis for every stock in the watchlist
    and returns them ranked by attention score (highest first). This allows
    the frontend to display a prioritized list of stocks that deserve attention.

    The ranking includes:
    - total_items: Total number of stocks in watchlist
    - items_needing_attention: Count of stocks with score > 20
    - ranked: List of stocks sorted by attention score (descending)

    Args:
        id: Watchlist ID
        db: Database session
        user: Authenticated user

    Returns:
        DriftyWatchlistOut with ranked list of stocks by attention score

    Raises:
        HTTPException 404: Watchlist doesn't exist or user doesn't own it
    """
    watchlist = _get_watchlist_or_404(db, id, user)

    ranked = []
    for item in watchlist.items:
        try:
            drifty = compute_drifty(id, item.symbol, user, db)
            ranked.append(
                DriftyRankedItem(
                    symbol=item.symbol,
                    attention_score=drifty.attention_score,
                    why=", ".join(drifty.why_interesting[:2]) if drifty.why_interesting else "Normal activity",
                )
            )
        except HTTPException:
            # Skip symbols with no data - they won't appear in ranking
            continue

    # Sort by attention score (descending) - highest scores first
    ranked.sort(key=lambda x: x.attention_score, reverse=True)

    # Count items needing attention (score > 20 threshold)
    items_needing_attention = sum(1 for item in ranked if item.attention_score > 20)

    return DriftyWatchlistOut(
        watchlist_id=id,
        total_items=len(watchlist.items),
        items_needing_attention=items_needing_attention,
        ranked=ranked,
    )


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
        out.append(_serialize(item, quote, user))
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
        out.append(_serialize(item, quote, user))

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
        out.append(_serialize(item, quote, user))
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
        similar_moves = stats.pop("similar_moves", [])
        quote = SymbolQuote(symbol=symbol, watch_count=0, fetch_ok=True, **stats)
        quote.spark_closes_json = json.dumps(spark_closes)
        quote.similar_moves_json = json.dumps(similar_moves)
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

    return _serialize(item, quote, user)


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
    return _serialize(item, quote, user)


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
        current_keys = change_detection.evaluate(None, quote, sensitivity=user.sensitivity)["keys"]
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

    return _serialize(item, quote, user)
