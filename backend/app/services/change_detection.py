"""The actual differentiator: rule-based, auditable "what changed" scoring.

Every rule here maps 1:1 to PROJECT_BRIEF.md §1. Deliberately not ML/LLM --
see ENGINEERING_DECISIONS.md for why: a rule can be defended with the exact
number that fired it, in front of a judge, with no re-guessing.
"""

from app.models import SymbolQuote

PRICE_MOVE_WEIGHT = 2.0
VOLUME_WEIGHT = 1.0
WEEK52_WEIGHT = 1.5

MIN_MOVE_THRESHOLD = 0.01  # floor so near-zero-volatility instruments don't get flagged on noise
MOVE_SENSITIVITY = 1.5  # multiplier on the symbol's own trailing average move
VOLUME_SPIKE_MULTIPLE = 2.0
NEAR_52W_PCT = 0.03  # within 3% counts as "near" the extreme

# Portfolio-level rule thresholds
PORTFOLIO_MOVE_THRESHOLD = 0.02  # 2% move required to count as "moved"
PORTFOLIO_MIN_SYMBOLS = 3  # minimum number of symbols moving together


def evaluate(price_at_last_view: float | None, quote: SymbolQuote, previously_fired: frozenset[str] | None = None) -> dict:
    """Returns fired rules (each with a human-readable message and the raw
    number behind it), a numeric attention score, whether this symbol
    belongs in the "what changed" feed at all, and the set of structural
    rule keys currently true (for the caller to snapshot at mark-seen time).

    `previously_fired` is the set of structural rule keys (see `keys` in the
    return value) that were already true the last time the user looked --
    price_move doesn't need this, it's already anchored to price_at_last_view
    and naturally resets to "not firing" the moment that baseline moves.
    Unusual volume and 52-week proximity are NOT time-anchored on their own
    (they're facts about the current quote, not about the gap since your
    last visit), so without this, a stock sitting near its 52-week high
    would stay stuck in the attention feed forever, "mark as seen" doing
    nothing -- that was a real reported bug, not a hypothetical. Suppressing
    a rule that already fired last time you looked, while still firing it
    the moment it becomes newly true again, is what actually makes "mark
    as seen" mean something for these rules.
    """
    previously_fired = previously_fired or frozenset()
    fired: list[dict] = []
    keys: list[str] = []
    score = 0.0

    if quote.price is None:
        return {"fired": fired, "score": 0.0, "attention": False, "keys": keys}

    # ── 1. Price move since last view ────────────────────────────────────────
    if price_at_last_view and price_at_last_view > 0:
        pct_change = (quote.price - price_at_last_view) / price_at_last_view
        avg_move = quote.avg_daily_move_pct_20d or 0.0
        threshold = max(MIN_MOVE_THRESHOLD, MOVE_SENSITIVITY * avg_move)
        if abs(pct_change) >= threshold:
            direction = "Up" if pct_change >= 0 else "Down"
            fired.append(
                {
                    "rule": "price_move",
                    "message": (
                        f"{direction} {abs(pct_change) * 100:.1f}% since you last checked"
                        + (f", vs its usual ±{avg_move * 100:.1f}%" if avg_move > 0 else "")
                    ),
                    "value": pct_change,
                }
            )
            score += PRICE_MOVE_WEIGHT

    # ── 2. Intraday move from prev close (fires when no last-view baseline) ──
    elif quote.prev_close and quote.prev_close > 0:
        day_pct = (quote.price - quote.prev_close) / quote.prev_close
        avg_move = quote.avg_daily_move_pct_20d or 0.0
        day_threshold = max(0.02, MOVE_SENSITIVITY * avg_move)
        if abs(day_pct) >= day_threshold:
            direction = "Up" if day_pct >= 0 else "Down"
            fired.append(
                {
                    "rule": "price_move",
                    "message": f"{direction} {abs(day_pct) * 100:.1f}% today from yesterday's close",
                    "value": day_pct,
                }
            )
            score += PRICE_MOVE_WEIGHT * 0.8

    # ── 3. Unusual volume ─────────────────────────────────────────────────────
    if quote.volume is not None and quote.avg_volume_20d and quote.avg_volume_20d > 0:
        volume_ratio = quote.volume / quote.avg_volume_20d
        if volume_ratio >= VOLUME_SPIKE_MULTIPLE:
            keys.append("unusual_volume")
            if "unusual_volume" not in previously_fired:
                fired.append(
                    {
                        "rule": "unusual_volume",
                        "message": f"Volume is {volume_ratio:.1f}× its 20-day average ({quote.volume:,.0f} vs {quote.avg_volume_20d:,.0f})",
                        "value": volume_ratio,
                    }
                )
                score += VOLUME_WEIGHT

    # ── 4. 52-week high/low (exact hit or within 3%) ──────────────────────────
    if quote.week52_high is not None:
        if quote.price >= quote.week52_high:
            keys.append("week52_high_exact")
            if "week52_high_exact" not in previously_fired:
                fired.append({
                    "rule": "week52_high",
                    "message": f"At a new 52-week high ({quote.price:.2f}, was {quote.week52_high:.2f})",
                    "value": quote.price,
                })
                score += WEEK52_WEIGHT
        elif quote.price >= quote.week52_high * (1 - NEAR_52W_PCT):
            keys.append("week52_high_near")
            if "week52_high_near" not in previously_fired:
                pct_away = (quote.week52_high - quote.price) / quote.week52_high * 100
                fired.append({
                    "rule": "week52_high",
                    "message": f"Within {pct_away:.1f}% of its 52-week high",
                    "value": quote.price,
                })
                score += WEEK52_WEIGHT * 0.6

    if quote.week52_low is not None:
        if quote.price <= quote.week52_low:
            keys.append("week52_low_exact")
            if "week52_low_exact" not in previously_fired:
                fired.append({
                    "rule": "week52_low",
                    "message": f"At a new 52-week low ({quote.price:.2f}, was {quote.week52_low:.2f})",
                    "value": quote.price,
                })
                score += WEEK52_WEIGHT
        elif quote.price <= quote.week52_low * (1 + NEAR_52W_PCT):
            keys.append("week52_low_near")
            if "week52_low_near" not in previously_fired:
                pct_away = (quote.price - quote.week52_low) / quote.week52_low * 100
                fired.append({
                    "rule": "week52_low",
                    "message": f"Within {pct_away:.1f}% of its 52-week low",
                    "value": quote.price,
                })
                score += WEEK52_WEIGHT * 0.6

    return {"fired": fired, "score": score, "attention": len(fired) > 0, "keys": keys}


def evaluate_portfolio(quotes: list[SymbolQuote]) -> dict:
    """Portfolio-level rule: checks if 3+ symbols moved in the same direction
    by more than 2% today (from prev_close).

    Returns a fired rule with the count, direction, and symbols if the threshold
    is met, otherwise returns empty.
    """
    if not quotes:
        return {"fired": [], "score": 0.0, "attention": False, "keys": []}

    # Track up and down movements
    up_symbols = []
    down_symbols = []

    for quote in quotes:
        if quote.price is None or quote.prev_close is None or quote.prev_close <= 0:
            continue

        day_pct = (quote.price - quote.prev_close) / quote.prev_close

        if abs(day_pct) >= PORTFOLIO_MOVE_THRESHOLD:
            if day_pct > 0:
                up_symbols.append((quote.symbol, day_pct))
            else:
                down_symbols.append((quote.symbol, day_pct))

    # Check if we have enough symbols moving in the same direction
    fired: list[dict] = []
    score = 0.0

    if len(up_symbols) >= PORTFOLIO_MIN_SYMBOLS:
        direction = "up"
        symbols_str = ", ".join([s[0] for s in up_symbols])
        avg_move = sum(s[1] for s in up_symbols) / len(up_symbols)
        fired.append({
            "rule": "portfolio_move",
            "message": (
                f"{len(up_symbols)} symbols moved {direction} today (avg {avg_move * 100:.1f}%): {symbols_str}"
            ),
            "value": avg_move,
        })
        score += VOLUME_WEIGHT  # Use same weight as volume for portfolio events

    elif len(down_symbols) >= PORTFOLIO_MIN_SYMBOLS:
        direction = "down"
        symbols_str = ", ".join([s[0] for s in down_symbols])
        avg_move = sum(s[1] for s in down_symbols) / len(down_symbols)
        fired.append({
            "rule": "portfolio_move",
            "message": (
                f"{len(down_symbols)} symbols moved {direction} today (avg {abs(avg_move) * 100:.1f}%): {symbols_str}"
            ),
            "value": avg_move,
        })
        score += VOLUME_WEIGHT  # Use same weight as volume for portfolio events

    return {"fired": fired, "score": score, "attention": len(fired) > 0, "keys": []}
