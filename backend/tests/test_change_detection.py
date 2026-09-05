"""Unit tests for backend/app/services/change_detection.py.

Each test constructs a synthetic SymbolQuote (no DB, no SQLAlchemy session
needed -- the ORM model accepts keyword args on __init__) and calls
change_detection.evaluate() directly, asserting on the returned dict's
`fired`, `score`, and `attention` keys.

Rule constants from change_detection (re-imported here for readability):
  PRICE_MOVE_WEIGHT  = 2.0
  VOLUME_WEIGHT      = 1.0
  WEEK52_WEIGHT      = 1.5
  MIN_MOVE_THRESHOLD = 0.01
  MOVE_SENSITIVITY   = 1.5
  VOLUME_SPIKE_MULTIPLE = 2.0
  NEAR_52W_PCT       = 0.03
"""

import pytest

from app.models import SymbolQuote
from app.services import change_detection
from app.services.change_detection import (
    MIN_MOVE_THRESHOLD,
    MOVE_SENSITIVITY,
    NEAR_52W_PCT,
    PRICE_MOVE_WEIGHT,
    VOLUME_SPIKE_MULTIPLE,
    VOLUME_WEIGHT,
    WEEK52_WEIGHT,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_quote(**kwargs) -> SymbolQuote:
    """Build a SymbolQuote with safe defaults; override via kwargs."""
    defaults = dict(
        symbol="TEST",
        currency="USD",
        price=100.0,
        prev_close=100.0,
        volume=None,
        avg_volume_20d=None,
        avg_daily_move_pct_20d=None,
        week52_high=None,
        week52_low=None,
        fetched_at=None,
        fetch_ok=True,
        watch_count=1,
        spark_closes_json=None,
    )
    defaults.update(kwargs)
    return SymbolQuote(**defaults)


def fired_rules(result: dict) -> list[str]:
    return [r["rule"] for r in result["fired"]]


# ─── Early-exit: price is None ────────────────────────────────────────────────

def test_no_price_returns_empty():
    quote = make_quote(price=None)
    result = change_detection.evaluate(None, quote)
    assert result == {"fired": [], "score": 0.0, "attention": False, "keys": []}


# ─── Rule 1: Price move vs last-view baseline ─────────────────────────────────

class TestPriceMoveWithBaseline:
    """Uses the price_at_last_view path (elif skipped)."""

    def test_move_above_threshold_fires(self):
        # avg_daily_move_pct_20d=0.01 → threshold = max(0.01, 1.5*0.01) = 0.015
        # price went from 100 → 102 (+2%) which exceeds 1.5%
        quote = make_quote(price=102.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote)
        assert "price_move" in fired_rules(result)
        assert result["score"] == pytest.approx(PRICE_MOVE_WEIGHT)
        assert result["attention"] is True

    def test_move_below_threshold_does_not_fire(self):
        # threshold = max(0.01, 1.5*0.02) = 0.03; move = 1% < 3%
        quote = make_quote(price=101.0, avg_daily_move_pct_20d=0.02)
        result = change_detection.evaluate(100.0, quote)
        assert "price_move" not in fired_rules(result)
        assert result["score"] == 0.0

    def test_move_exactly_at_threshold_fires(self):
        # avg_move=0.01 → threshold=0.015; move = exactly +1.5%
        quote = make_quote(price=101.5, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote)
        assert "price_move" in fired_rules(result)

    def test_direction_up(self):
        quote = make_quote(price=105.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote)
        msg = result["fired"][0]["message"]
        assert msg.startswith("Up")

    def test_direction_down(self):
        quote = make_quote(price=95.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote)
        msg = result["fired"][0]["message"]
        assert msg.startswith("Down")

    def test_avg_move_suffix_present_when_nonzero(self):
        quote = make_quote(price=105.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote)
        msg = result["fired"][0]["message"]
        assert "vs its usual" in msg

    def test_no_avg_move_suffix_when_avg_zero(self):
        # avg_daily_move_pct_20d=0 → threshold falls back to MIN_MOVE_THRESHOLD=0.01
        quote = make_quote(price=105.0, avg_daily_move_pct_20d=0.0)
        result = change_detection.evaluate(100.0, quote)
        msg = result["fired"][0]["message"]
        assert "vs its usual" not in msg

    def test_min_move_threshold_floor(self):
        # Even with avg_move=0, threshold = max(0.01, 0) = 0.01
        # A 0.5% move (< 1%) should NOT fire
        quote = make_quote(price=100.5, avg_daily_move_pct_20d=0.0)
        result = change_detection.evaluate(100.0, quote)
        assert "price_move" not in fired_rules(result)

    def test_trailing_volatility_sensitivity(self):
        # avg_move=0.02 → threshold=1.5*0.02=0.03
        # +2.9% move (< 3%) should not fire; +3.1% should
        quote_low = make_quote(price=102.9, avg_daily_move_pct_20d=0.02)
        quote_high = make_quote(price=103.1, avg_daily_move_pct_20d=0.02)
        assert "price_move" not in fired_rules(change_detection.evaluate(100.0, quote_low))
        assert "price_move" in fired_rules(change_detection.evaluate(100.0, quote_high))

    def test_price_at_last_view_zero_does_not_divide(self):
        # price_at_last_view=0 should be ignored (falsy guard prevents div-by-zero)
        quote = make_quote(price=100.0, prev_close=95.0, avg_daily_move_pct_20d=0.01)
        # falls through to intraday branch, not baseline branch
        result = change_detection.evaluate(0.0, quote)
        # +5.26% intraday > max(0.02, 0.015)=0.02 → fires via intraday path
        assert result["score"] == pytest.approx(PRICE_MOVE_WEIGHT * 0.8)


# ─── Rule 2: Intraday fallback (no last-view baseline) ───────────────────────

class TestIntradayFallback:
    """price_at_last_view is None → falls through to elif prev_close path."""

    def test_intraday_move_above_threshold_fires(self):
        # prev_close=100, price=103 → +3% > max(0.02, 0.015)=0.02
        quote = make_quote(price=103.0, prev_close=100.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(None, quote)
        assert "price_move" in fired_rules(result)

    def test_intraday_score_is_reduced_weight(self):
        quote = make_quote(price=103.0, prev_close=100.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(None, quote)
        assert result["score"] == pytest.approx(PRICE_MOVE_WEIGHT * 0.8)

    def test_intraday_below_threshold_does_not_fire(self):
        # prev_close=100, price=101 → +1% < max(0.02, 0.015)=0.02
        quote = make_quote(price=101.0, prev_close=100.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(None, quote)
        assert "price_move" not in fired_rules(result)

    def test_intraday_minimum_floor_is_2pct(self):
        # Even with avg_move=0, intraday floor is 0.02 (not MIN_MOVE_THRESHOLD=0.01)
        # +1.5% should not fire
        quote = make_quote(price=101.5, prev_close=100.0, avg_daily_move_pct_20d=0.0)
        result = change_detection.evaluate(None, quote)
        assert "price_move" not in fired_rules(result)

    def test_intraday_direction_down(self):
        quote = make_quote(price=97.0, prev_close=100.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(None, quote)
        msg = result["fired"][0]["message"]
        assert "Down" in msg and "today" in msg

    def test_intraday_no_suffix_about_usual_move(self):
        # Intraday message format is different: "X% today from yesterday's close"
        # no "vs its usual" suffix
        quote = make_quote(price=103.0, prev_close=100.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(None, quote)
        msg = result["fired"][0]["message"]
        assert "today from yesterday" in msg
        assert "vs its usual" not in msg

    def test_intraday_skipped_when_prev_close_none(self):
        # No baseline AND no prev_close → no price_move rule at all
        quote = make_quote(price=103.0, prev_close=None)
        result = change_detection.evaluate(None, quote)
        assert "price_move" not in fired_rules(result)


# ─── Rule 3: Unusual volume ───────────────────────────────────────────────────

class TestUnusualVolume:

    def test_volume_at_2x_fires(self):
        quote = make_quote(volume=2_000_000.0, avg_volume_20d=1_000_000.0)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" in fired_rules(result)
        assert result["score"] == pytest.approx(VOLUME_WEIGHT)

    def test_volume_below_2x_does_not_fire(self):
        quote = make_quote(volume=1_900_000.0, avg_volume_20d=1_000_000.0)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" not in fired_rules(result)

    def test_volume_exactly_2x_fires(self):
        quote = make_quote(volume=2_000_000.0, avg_volume_20d=1_000_000.0)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" in fired_rules(result)

    def test_volume_message_contains_ratio(self):
        quote = make_quote(volume=3_000_000.0, avg_volume_20d=1_000_000.0)
        result = change_detection.evaluate(None, quote)
        fired = next(r for r in result["fired"] if r["rule"] == "unusual_volume")
        assert "3.0×" in fired["message"]

    def test_no_fire_when_volume_is_none(self):
        quote = make_quote(volume=None, avg_volume_20d=1_000_000.0)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" not in fired_rules(result)

    def test_no_fire_when_avg_volume_is_none(self):
        quote = make_quote(volume=5_000_000.0, avg_volume_20d=None)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" not in fired_rules(result)

    def test_no_fire_when_avg_volume_is_zero(self):
        quote = make_quote(volume=5_000_000.0, avg_volume_20d=0.0)
        result = change_detection.evaluate(None, quote)
        assert "unusual_volume" not in fired_rules(result)


# ─── Rule 4a: 52-week high ────────────────────────────────────────────────────

class TestWeek52High:

    def test_exact_hit_fires(self):
        # price == week52_high; prev_close=price so intraday branch doesn't also fire
        quote = make_quote(price=150.0, prev_close=150.0, week52_high=150.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_high"]
        assert len(fired) == 1
        assert "new 52-week high" in fired[0]["message"]
        assert result["score"] == pytest.approx(WEEK52_WEIGHT)

    def test_above_high_fires_exact_message(self):
        # price > week52_high (intraday breakout above recorded high)
        quote = make_quote(price=152.0, prev_close=152.0, week52_high=150.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_high"]
        assert len(fired) == 1
        assert "new 52-week high" in fired[0]["message"]

    def test_near_high_within_3pct_fires_near_message(self):
        # Within 3% of 150 → 150 * 0.97 = 145.5; price=146 qualifies
        # prev_close=price to isolate the 52w rule score
        quote = make_quote(price=146.0, prev_close=146.0, week52_high=150.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_high"]
        assert len(fired) == 1
        assert "Within" in fired[0]["message"] and "52-week high" in fired[0]["message"]
        assert result["score"] == pytest.approx(WEEK52_WEIGHT * 0.6)

    def test_near_high_score_is_reduced(self):
        quote = make_quote(price=146.0, prev_close=146.0, week52_high=150.0)
        result = change_detection.evaluate(None, quote)
        assert result["score"] == pytest.approx(WEEK52_WEIGHT * 0.6)

    def test_outside_near_zone_does_not_fire(self):
        # More than 3% away: 150 * 0.97 = 145.5; price=145 is just outside
        quote = make_quote(price=145.0, prev_close=145.0, week52_high=150.0)
        result = change_detection.evaluate(None, quote)
        assert all(r["rule"] != "week52_high" for r in result["fired"])

    def test_no_fire_when_week52_high_is_none(self):
        quote = make_quote(price=200.0, prev_close=200.0, week52_high=None)
        result = change_detection.evaluate(None, quote)
        assert all(r["rule"] != "week52_high" for r in result["fired"])


# ─── Rule 4b: 52-week low ─────────────────────────────────────────────────────

class TestWeek52Low:

    def test_exact_hit_fires(self):
        # price == week52_low; prev_close=price so intraday branch doesn't also fire
        quote = make_quote(price=50.0, prev_close=50.0, week52_low=50.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_low"]
        assert len(fired) == 1
        assert "new 52-week low" in fired[0]["message"]
        assert result["score"] == pytest.approx(WEEK52_WEIGHT)

    def test_below_low_fires_exact_message(self):
        quote = make_quote(price=48.0, prev_close=48.0, week52_low=50.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_low"]
        assert len(fired) == 1
        assert "new 52-week low" in fired[0]["message"]

    def test_near_low_within_3pct_fires_near_message(self):
        # Within 3% of 50 → 50 * 1.03 = 51.5; price=51 qualifies
        # prev_close=price to isolate the 52w rule score
        quote = make_quote(price=51.0, prev_close=51.0, week52_low=50.0)
        result = change_detection.evaluate(None, quote)
        fired = [r for r in result["fired"] if r["rule"] == "week52_low"]
        assert len(fired) == 1
        assert "Within" in fired[0]["message"] and "52-week low" in fired[0]["message"]
        assert result["score"] == pytest.approx(WEEK52_WEIGHT * 0.6)

    def test_outside_near_zone_does_not_fire(self):
        # 3% above 50 = 51.5; price=52 is outside
        quote = make_quote(price=52.0, prev_close=52.0, week52_low=50.0)
        result = change_detection.evaluate(None, quote)
        assert all(r["rule"] != "week52_low" for r in result["fired"])

    def test_no_fire_when_week52_low_is_none(self):
        quote = make_quote(price=10.0, prev_close=10.0, week52_low=None)
        result = change_detection.evaluate(None, quote)
        assert all(r["rule"] != "week52_low" for r in result["fired"])


# ─── Multi-rule stacking ──────────────────────────────────────────────────────

class TestMultiRuleStacking:

    def test_price_move_and_volume_both_fire(self):
        # price: +5% from last view (avg_move=0.01 → threshold=0.015)
        # volume: 3× avg
        quote = make_quote(
            price=105.0,
            avg_daily_move_pct_20d=0.01,
            volume=3_000_000.0,
            avg_volume_20d=1_000_000.0,
        )
        result = change_detection.evaluate(100.0, quote)
        rules = fired_rules(result)
        assert "price_move" in rules
        assert "unusual_volume" in rules
        assert result["score"] == pytest.approx(PRICE_MOVE_WEIGHT + VOLUME_WEIGHT)
        assert result["attention"] is True

    def test_three_rules_stack_score_correctly(self):
        # price move (baseline) + unusual volume + 52w high exact
        quote = make_quote(
            price=150.0,
            avg_daily_move_pct_20d=0.01,
            volume=3_000_000.0,
            avg_volume_20d=1_000_000.0,
            week52_high=150.0,
        )
        result = change_detection.evaluate(100.0, quote)
        rules = fired_rules(result)
        assert "price_move" in rules
        assert "unusual_volume" in rules
        assert "week52_high" in rules
        expected_score = PRICE_MOVE_WEIGHT + VOLUME_WEIGHT + WEEK52_WEIGHT
        assert result["score"] == pytest.approx(expected_score)

    def test_high_and_low_both_near_each_other(self):
        # Edge case: near-high AND near-low both fire when price is sandwiched
        # (unusual but valid data — narrow 52w range)
        # price=100, high=101 (within 3%), low=99 (within 3%)
        quote = make_quote(price=100.0, week52_high=101.0, week52_low=99.0)
        result = change_detection.evaluate(None, quote)
        rules = fired_rules(result)
        assert "week52_high" in rules
        assert "week52_low" in rules

    def test_no_rules_fire_returns_attention_false(self):
        quote = make_quote(price=100.0)
        result = change_detection.evaluate(100.0, quote)
        assert result["attention"] is False
        assert result["fired"] == []
        assert result["score"] == 0.0


class TestPreviouslyFiredSuppression:
    """Covers the reported bug: 'mark as seen' visibly did nothing for a
    stock sitting near its 52-week high or trading on unusual volume,
    because those rules aren't anchored to price_at_last_view the way
    price_move is -- they'd fire again on every refresh regardless of
    whether the user had already seen them. `previously_fired` is the
    snapshot taken at mark-seen time; these tests confirm it actually
    suppresses a standing fact, but still re-fires the moment something
    genuinely new happens.
    """

    def test_near_52w_high_suppressed_once_already_seen(self):
        # prev_close pinned to price so the intraday price-move fallback
        # (unrelated to what this test covers) doesn't also fire
        quote = make_quote(price=98.0, prev_close=98.0, week52_high=100.0)  # within 3%
        first = change_detection.evaluate(None, quote)
        assert "week52_high" in fired_rules(first)
        assert "week52_high_near" in first["keys"]

        # simulate "mark as seen" snapshotting that key, then re-evaluating
        # against the identical, unchanged quote
        second = change_detection.evaluate(None, quote, frozenset(first["keys"]))
        assert "week52_high" not in fired_rules(second)
        assert second["attention"] is False

    def test_upgrading_from_near_to_new_high_still_fires(self):
        # previously only "near" the high -- now it's broken through to a
        # genuine new high, which is new information and must still fire
        previously_fired = frozenset(["week52_high_near"])
        quote = make_quote(price=101.0, week52_high=100.0)  # now at/above it
        result = change_detection.evaluate(None, quote, previously_fired)
        assert "week52_high" in fired_rules(result)
        assert result["attention"] is True

    def test_unusual_volume_suppressed_once_already_seen(self):
        quote = make_quote(price=100.0, volume=3_000_000.0, avg_volume_20d=1_000_000.0)
        first = change_detection.evaluate(None, quote)
        assert "unusual_volume" in fired_rules(first)

        second = change_detection.evaluate(None, quote, frozenset(first["keys"]))
        assert "unusual_volume" not in fired_rules(second)
        assert second["attention"] is False

    def test_price_move_ignores_previously_fired(self):
        # price_move is already anchored to price_at_last_view -- it must
        # never be suppressed by a structural-rule snapshot
        quote = make_quote(price=110.0, avg_daily_move_pct_20d=0.01)
        result = change_detection.evaluate(100.0, quote, frozenset(["price_move"]))
        assert "price_move" in fired_rules(result)
        assert result["attention"] is True
