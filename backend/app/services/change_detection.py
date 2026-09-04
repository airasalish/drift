"""The actual differentiator: rule-based, auditable "what changed" scoring.

Every rule here maps 1:1 to PROJECT_BRIEF.md §1. Deliberately not ML/LLM —
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


def evaluate(price_at_last_view: float | None, quote: SymbolQuote) -> dict:
    """Returns fired rules (each with a human-readable message and the raw
    number behind it), a numeric attention score, and whether this symbol
    belongs in the "what changed" feed at all.
    """
    fired: list[dict] = []
    score = 0.0

    if quote.price is None:
        return {"fired": fired, "score": 0.0, "attention": False}

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
            fired.append(
                {
                    "rule": "unusual_volume",
                    "message": f"Volume is {volume_ratio:.1f}× its 20-day average",
                    "value": volume_ratio,
                }
            )
            score += VOLUME_WEIGHT

    # ── 4. 52-week high/low (exact hit or within 3%) ──────────────────────────
    if quote.week52_high is not None:
        if quote.price >= quote.week52_high:
            fired.append({
                "rule": "week52_high",
                "message": "At a new 52-week high",
                "value": quote.price,
            })
            score += WEEK52_WEIGHT
        elif quote.price >= quote.week52_high * (1 - NEAR_52W_PCT):
            pct_away = (quote.week52_high - quote.price) / quote.week52_high * 100
            fired.append({
                "rule": "week52_high",
                "message": f"Within {pct_away:.1f}% of its 52-week high",
                "value": quote.price,
            })
            score += WEEK52_WEIGHT * 0.6

    if quote.week52_low is not None:
        if quote.price <= quote.week52_low:
            fired.append({
                "rule": "week52_low",
                "message": "At a new 52-week low",
                "value": quote.price,
            })
            score += WEEK52_WEIGHT
        elif quote.price <= quote.week52_low * (1 + NEAR_52W_PCT):
            pct_away = (quote.price - quote.week52_low) / quote.week52_low * 100
            fired.append({
                "rule": "week52_low",
                "message": f"Within {pct_away:.1f}% of its 52-week low",
                "value": quote.price,
            })
            score += WEEK52_WEIGHT * 0.6

    return {"fired": fired, "score": score, "attention": len(fired) > 0}
