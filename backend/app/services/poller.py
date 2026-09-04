"""Background refresh loop: fetches each watched symbol once per interval
and writes it to the shared SymbolQuote cache. API requests only ever read
that cache — see PROJECT_BRIEF.md §5 (fetch once, fan out to every watcher).

Only symbols actually on a watchlist are polled at all. True popularity-
weighted frequency (poll heavily-watched symbols more often) is deferred —
`watch_count` is tracked and ready for it. See ENGINEERING_DECISIONS.md.
"""

import asyncio
import datetime
import json
import logging
import os

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import SymbolQuote, WatchlistItem
from app.services.market_data import fetch_symbol_stats

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))


def refresh_all_watched_symbols() -> None:
    db = SessionLocal()
    try:
        rows = db.execute(
            select(WatchlistItem.symbol, func.count(WatchlistItem.id)).group_by(WatchlistItem.symbol)
        ).all()

        for symbol, watch_count in rows:
            stats = fetch_symbol_stats(symbol)
            quote = db.get(SymbolQuote, symbol)
            if quote is None:
                quote = SymbolQuote(symbol=symbol)
                db.add(quote)

            quote.watch_count = watch_count
            if stats is not None:
                quote.price = stats["price"]
                quote.prev_close = stats["prev_close"]
                quote.volume = stats["volume"]
                quote.avg_volume_20d = stats["avg_volume_20d"]
                quote.avg_daily_move_pct_20d = stats["avg_daily_move_pct_20d"]
                quote.week52_high = stats["week52_high"]
                quote.week52_low = stats["week52_low"]
                quote.spark_closes_json = json.dumps(stats["spark_closes"])
                quote.fetched_at = datetime.datetime.utcnow()
                quote.fetch_ok = True
            else:
                # fetch failed: leave last-known price in place, but mark it
                # stale rather than silently pretending it's current
                quote.fetch_ok = False

        db.commit()
    finally:
        db.close()


async def poll_forever() -> None:
    while True:
        try:
            await asyncio.to_thread(refresh_all_watched_symbols)
        except Exception:
            logger.exception("poll cycle failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
