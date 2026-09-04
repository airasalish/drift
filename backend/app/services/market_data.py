"""Thin wrapper around yfinance. Never called per-request — only from the
background poller (see services/poller.py). One call per symbol gets us
everything the change-detection rules need: current price/volume, trailing
20-day volume & move averages, and 52-week high/low.
"""

import logging
import math

import yfinance as yf

logger = logging.getLogger(__name__)


def _clean(x: float | None) -> float | None:
    """NaN is a real, not-rare thing yfinance returns (e.g. the still-forming
    current bar mid-session can have incomplete OHLC) -- and it's silently
    truthy in Python, so `if value:` guards elsewhere in this codebase don't
    catch it, and it propagates through arithmetic with no exception until
    it hits JSON encoding, where it's a hard error. Converting it to None at
    the source is the same "mark it missing, don't pretend it's real" rule
    already applied everywhere else in this app to stale/failed data.
    """
    if x is None:
        return None
    return None if math.isnan(x) else x


def fetch_symbol_stats(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y", interval="1d", auto_adjust=False)
        try:
            currency = ticker.fast_info.currency
        except Exception:
            currency = None
    except Exception:
        logger.exception("yfinance fetch failed for %s", symbol)
        return None

    if hist is None or hist.empty or len(hist) < 2:
        return None

    closes = hist["Close"]
    volumes = hist["Volume"]

    latest_price = float(closes.iloc[-1])
    prev_close = float(closes.iloc[-2])
    latest_volume = float(volumes.iloc[-1])

    # trailing window excludes today's own bar, so "today" is compared
    # against a baseline that doesn't include itself
    trailing = hist.iloc[-21:-1] if len(hist) >= 21 else hist.iloc[:-1]
    daily_move_pct = trailing["Close"].pct_change().abs().dropna()

    avg_daily_move_pct_20d = float(daily_move_pct.mean()) if not daily_move_pct.empty else 0.0
    avg_volume_20d = float(trailing["Volume"].mean()) if not trailing.empty else latest_volume

    # drop NaN points rather than pass them through -- a gap in the sparkline
    # is honest; a NaN reaching the frontend (or JSON encoding) is not
    spark_closes = [round(c, 4) for c in closes.tail(30).tolist() if not math.isnan(c)]

    return {
        "price": _clean(latest_price),
        "prev_close": _clean(prev_close),
        "volume": _clean(latest_volume),
        "avg_volume_20d": _clean(avg_volume_20d),
        "avg_daily_move_pct_20d": _clean(avg_daily_move_pct_20d),
        "week52_high": _clean(float(hist["High"].max())),
        "week52_low": _clean(float(hist["Low"].min())),
        "spark_closes": spark_closes,
        "currency": currency,
    }
