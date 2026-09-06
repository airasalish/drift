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

    This function retrieves historical price data from yfinance for a given
    symbol and time range. It returns OHLC (Open, High, Low, Close) data when
    available, and gracefully degrades to close-only data when OHLC is not available.

    Supported timeframes:
    - "1D": latest daily session return, shown with recent daily bars for context
    - "5D": 5 days (daily granularity)
    - "1M": 1 month (daily granularity)
    - "3M": 3 months (daily granularity)
    - "6M": 6 months (daily granularity)
    - "YTD": Year-to-date (daily granularity)
    - "1Y": 1 year (daily granularity)
    - "5Y": 5 years (daily granularity)
    - "ALL": All available data (daily granularity)

    Data Handling:
    - All data is daily granularity (no intraday data)
    - NaN values are cleaned to None to prevent JSON encoding errors
    - Data points with missing close prices are skipped entirely
    - OHLC fields are optional and only included when available
    - Volume data is optional and only included when available

    Args:
        symbol: Stock ticker symbol (e.g., "AAPL", "^NSEI")
        range_name: Time range identifier from supported list above

    Returns:
        dict with chart data structure:
        {
            "symbol": str,           # The requested symbol
            "range": str,             # The requested range
            "dates": list[str],       # List of date strings (YYYY-MM-DD)
            "closes": list[float],    # Required: Close prices (never None)
            "opens": list[float | None] | None,  # Optional: Open prices
            "highs": list[float | None] | None,  # Optional: High prices
            "lows": list[float | None] | None,   # Optional: Low prices
            "volumes": list[float | None] | None, # Optional: Volume data
            "currency": str | None    # Currency code if available
        }

        Returns None if:
        - Invalid range_name provided
        - yfinance request fails
        - No data available for the symbol/range

    Raises:
        No exceptions raised; errors return None and are logged

    Notes:
        - The function uses the _clean() helper to convert NaN to None
        - Date strings are in ISO format (YYYY-MM-DD)
        - All lists are guaranteed to be the same length when present
        - Required fields (dates, closes) will never contain None values
        - Optional fields (opens, highs, lows, volumes) may be None or contain None values
    """
    # Map range names to yfinance period parameters
    period_map = {
        # yfinance can return only one daily bar for period=1d, which cannot
        # render a meaningful chart. Use real recent daily bars for the view;
        # the frontend calculates the 1D return from the cached live quote and
        # previous close, so this is never confused with a range return.
        "1D": "5d",
        "5D": "5d",
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "YTD": "ytd",
        "1Y": "1y",
        "5Y": "5y",
        "ALL": "max",
    }

    # Validate range name
    if range_name not in period_map:
        logger.warning("Invalid chart range '%s' for symbol '%s'", range_name, symbol)
        return None

    period = period_map[range_name]

    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval="1d", auto_adjust=False)

        # Try to get currency info, but don't fail if unavailable
        try:
            currency = ticker.fast_info.currency
        except Exception:
            currency = None
    except Exception:
        logger.exception("yfinance chart fetch failed for %s (range: %s)", symbol, range_name)
        return None

    # Validate response
    if hist is None or hist.empty:
        logger.warning("No chart data returned for %s (range: %s)", symbol, range_name)
        return None

    # Build response with available OHLC data
    dates: list[str] = []
    opens: list[float | None] = []
    highs: list[float | None] = []
    lows: list[float | None] = []
    closes: list[float] = []
    volumes: list[float | None] = []

    for idx in range(len(hist)):
        date = hist.index[idx]
        try:
            date_str = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)
        except (ValueError, TypeError):
            logger.warning("Failed to parse date for %s at index %d", symbol, idx)
            continue

        # Get close (required) - skip if missing
        close = hist["Close"].iloc[idx]
        if close is None or math.isnan(close):
            continue  # Skip data points with missing close prices
        close_val = float(close)

        # Get OHLC (optional) - use _clean to handle NaN
        open_val = _clean(float(hist["Open"].iloc[idx]) if "Open" in hist.columns else None)
        high_val = _clean(float(hist["High"].iloc[idx]) if "High" in hist.columns else None)
        low_val = _clean(float(hist["Low"].iloc[idx]) if "Low" in hist.columns else None)
        volume_val = _clean(float(hist["Volume"].iloc[idx]) if "Volume" in hist.columns else None)

        dates.append(date_str)
        opens.append(open_val)
        highs.append(high_val)
        lows.append(low_val)
        closes.append(close_val)
        volumes.append(volume_val)

    # If we have no valid data points, return None
    if not dates:
        logger.warning("No valid data points after cleaning for %s (range: %s)", symbol, range_name)
        return None

    # Build response - only include OHLC if actually available
    has_ohlc = any(o is not None for o in opens)
    result = {
        "symbol": symbol,
        "range": range_name,
        "dates": dates,
        "closes": closes,
        "currency": currency,
    }

    # Only include OHLC fields if we have actual data
    if has_ohlc:
        result["opens"] = opens
        result["highs"] = highs
        result["lows"] = lows

    # Only include volume if we have actual data
    if any(v is not None for v in volumes):
        result["volumes"] = volumes

    return result
