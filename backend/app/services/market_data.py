"""Thin wrapper around yfinance. Never called per-request — only from the
background poller (see services/poller.py). One call per symbol gets us
everything the change-detection rules need: current price/volume, trailing
20-day volume & move averages, and 52-week high/low.
"""

import logging
import math
from urllib.parse import urlparse

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


def domain_from_website(website: str | None) -> str | None:
    """Turn a yfinance `website` value into a bare domain for a favicon
    lookup. Best-effort: missing/garbage input returns None rather than
    guessing a company.
    """
    if not website or not isinstance(website, str):
        return None
    raw = website.strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "https://" + raw
    try:
        host = urlparse(raw).hostname
    except Exception:
        return None
    if not host:
        return None
    host = host.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None


def lookup_company_website(symbol: str) -> str | None:
    """Best-effort domain from yfinance Ticker.info. Never raises; a miss
    is None and the add path proceeds with ticker-only display.
    """
    try:
        info = yf.Ticker(symbol).info or {}
        website = info.get("website") or info.get("websiteUrl")
        return domain_from_website(website if isinstance(website, str) else None)
    except Exception:
        logger.exception("website lookup failed for %s", symbol)
        return None


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

    # Similar moves: compact record of the year's daily % moves
    # Store date + pct_change pairs for historical comparison
    similar_moves = []
    for idx in range(len(hist) - 1):  # Exclude the latest (today's) bar
        if idx >= len(closes) - 1:
            break
        try:
            prev_close_val = float(closes.iloc[idx])
            curr_close_val = float(closes.iloc[idx + 1])
            if prev_close_val > 0 and not math.isnan(prev_close_val) and not math.isnan(curr_close_val):
                pct_change = (curr_close_val - prev_close_val) / prev_close_val
                # Get the date from the index
                date = hist.index[idx + 1]
                if hasattr(date, 'strftime'):
                    date_str = date.strftime('%Y-%m-%d')
                else:
                    date_str = str(date)
                similar_moves.append({"date": date_str, "pct_change": round(pct_change, 6)})
        except (IndexError, ValueError, ZeroDivisionError):
            continue

    return {
        "price": _clean(latest_price),
        "prev_close": _clean(prev_close),
        "volume": _clean(latest_volume),
        "avg_volume_20d": _clean(avg_volume_20d),
        "avg_daily_move_pct_20d": _clean(avg_daily_move_pct_20d),
        "week52_high": _clean(float(hist["High"].max())),
        "week52_low": _clean(float(hist["Low"].min())),
        "spark_closes": spark_closes,
        "similar_moves": similar_moves,
        "currency": currency,
    }


def fetch_chart_data(symbol: str, range_name: str) -> dict | None:
    """Fetch chart data for a specific time range.

    Range options: "1M", "3M", "6M", "1Y", "ALL"
    All data is daily granularity (no intraday).
    """
    # Map range names to yfinance period parameters
    period_map = {
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "1Y": "1y",
        "ALL": "max",
    }

    if range_name not in period_map:
        return None

    period = period_map[range_name]

    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval="1d", auto_adjust=False)
        try:
            currency = ticker.fast_info.currency
        except Exception:
            currency = None
    except Exception:
        logger.exception("yfinance chart fetch failed for %s (range: %s)", symbol, range_name)
        return None

    if hist is None or hist.empty:
        return None

    closes = hist["Close"]

    # Drop NaN/unparseable points entirely rather than pass a null through --
    # same rule `spark_closes` above already follows: a gap in the chart is
    # honest, a null reaching the frontend (or failing response validation,
    # since ChartRangeOut's dates/closes aren't optional) is not.
    dates: list[str] = []
    chart_closes: list[float] = []
    for idx, close in enumerate(closes):
        if math.isnan(close):
            continue
        date = hist.index[idx]
        try:
            date_str = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)
            close_val = float(close)
        except (ValueError, TypeError):
            continue
        dates.append(date_str)
        chart_closes.append(close_val)

    return {
        "dates": dates,
        "closes": chart_closes,
        "currency": currency,
    }
