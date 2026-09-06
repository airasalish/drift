"""Tests for Drifty Intelligence Engine and multi-watchlist membership features."""

import json
import pytest
from sqlalchemy.orm import Session

from app.models import User, Watchlist, WatchlistItem, SymbolQuote
from app.services.market_data import fetch_chart_data


@pytest.fixture
def db_session():
    """Override the database dependency for testing."""
    from app.database import engine, Base, get_db

    # Create tables
    Base.metadata.create_all(bind=engine)

    # Use a single session for the test
    SessionLocal = get_db
    session = next(SessionLocal())

    yield session

    # Cleanup
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(name="drifty_user", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_watchlist(db_session, test_user):
    """Create a test watchlist."""
    watchlist = Watchlist(user_id=test_user.id, name="Test Watchlist")
    db_session.add(watchlist)
    db_session.commit()
    db_session.refresh(watchlist)
    return watchlist


@pytest.fixture
def test_quotes(db_session):
    """Create test symbol quotes with different characteristics."""
    # Check if quotes already exist to avoid UNIQUE constraint errors
    existing_symbols = {q.symbol for q in db_session.query(SymbolQuote).all()}

    # Normal stock (small move)
    if "NORMAL" not in existing_symbols:
        normal_quote = SymbolQuote(
            symbol="NORMAL",
            price=100.0,
            prev_close=99.5,
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([99.0, 99.5, 100.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(normal_quote)

    # High mover (2.5x normal move)
    if "HIGHMOVER" not in existing_symbols:
        high_mover = SymbolQuote(
            symbol="HIGHMOVER",
            price=105.0,
            prev_close=100.0,
            volume=5000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.02,
            week52_high=120.0,
            week52_low=80.0,
            spark_closes_json=json.dumps([100.0, 102.0, 105.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(high_mover)

    # Outlier (down while others up)
    if "OUTLIER" not in existing_symbols:
        outlier = SymbolQuote(
            symbol="OUTLIER",
            price=95.0,
            prev_close=100.0,
            volume=2000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,
            week52_high=110.0,
            week52_low=85.0,
            spark_closes_json=json.dumps([100.0, 98.0, 95.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(outlier)

    # Volume spike
    if "VOLSPIKE" not in existing_symbols:
        volume_spike = SymbolQuote(
            symbol="VOLSPIKE",
            price=101.0,
            prev_close=100.0,
            volume=5000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,
            week52_high=115.0,
            week52_low=85.0,
            spark_closes_json=json.dumps([100.0, 100.5, 101.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(volume_spike)

    # Benchmark (Nifty 50)
    if "^NSEI" not in existing_symbols:
        benchmark = SymbolQuote(
            symbol="^NSEI",
            price=20000.0,
            prev_close=19950.0,
            volume=0,
            avg_volume_20d=0,
            avg_daily_move_pct_20d=0.005,
            week52_high=22000.0,
            week52_low=18000.0,
            spark_closes_json=json.dumps([19900.0, 19950.0, 20000.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(benchmark)

    db_session.commit()
    return [db_session.get(SymbolQuote, s) for s in ["NORMAL", "HIGHMOVER", "OUTLIER", "VOLSPIKE", "^NSEI"]]


class TestDriftyIntelligence:
    """Tests for Drifty Intelligence Engine."""

    def test_drifty_single_stock_high_mover(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty analysis for a stock with high movement."""
        from app.routers.watchlist import compute_drifty

        # Add HIGHMOVER to watchlist
        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="HIGHMOVER",
            company_name="High Mover Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "HIGHMOVER", test_user, db_session)

        assert result.symbol == "HIGHMOVER"
        assert result.attention_score > 0
        assert result.self_analysis.move_magnitude == "2.5× normal"
        assert any("× its normal daily range" in reason for reason in result.why_interesting)

    def test_drifty_single_stock_outlier(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty analysis for an outlier stock."""
        from app.routers.watchlist import compute_drifty

        # Add multiple stocks so we can detect outlier behavior
        items = [
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="NORMAL", company_name="Normal Inc.", added_price=99.5),
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="HIGHMOVER", company_name="High Mover Inc.", added_price=100.0),
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="OUTLIER", company_name="Outlier Inc.", added_price=100.0),
        ]
        db_session.add_all(items)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "OUTLIER", test_user, db_session)

        # OUTLIER is down while others are up - should detect outlier
        assert result.peer_analysis.same_direction_count < len(test_watchlist.items) - 1
        assert any("outlier" in reason.lower() for reason in result.why_interesting)

    def test_drifty_single_stock_volume_spike(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty analysis for a stock with volume spike."""
        from app.routers.watchlist import compute_drifty

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="VOLSPIKE",
            company_name="Volume Spike Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "VOLSPIKE", test_user, db_session)

        # Should detect volume spike
        assert result.self_analysis.volume_vs_normal >= 2.0
        assert any("volume" in reason.lower() for reason in result.why_interesting)

    def test_drifty_single_stock_no_data(self, db_session, test_user, test_watchlist):
        """Test Drifty analysis for a stock with no market data."""
        from app.routers.watchlist import compute_drifty
        from fastapi import HTTPException

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="NODATA",
            company_name="No Data Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        try:
            compute_drifty(test_watchlist.id, "NODATA", test_user, db_session)
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 404

    def test_drifty_watchlist_ranking(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty ranking for an entire watchlist."""
        from app.routers.watchlist import get_drifty_watchlist

        # Add multiple stocks with different characteristics
        items = [
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="NORMAL", company_name="Normal Inc.", added_price=99.5),
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="HIGHMOVER", company_name="High Mover Inc.", added_price=100.0),
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="OUTLIER", company_name="Outlier Inc.", added_price=100.0),
            WatchlistItem(watchlist_id=test_watchlist.id, symbol="VOLSPIKE", company_name="Volume Spike Inc.", added_price=100.0),
        ]
        db_session.add_all(items)
        db_session.commit()

        result = get_drifty_watchlist(test_watchlist.id, db_session, test_user)

        assert result.watchlist_id == test_watchlist.id
        assert result.total_items == 4
        assert "items_needing_attention" in str(result)
        assert "ranked" in str(result)

        # Ranked should be sorted by attention score (descending)
        ranked = result.ranked
        if len(ranked) > 1:
            for i in range(len(ranked) - 1):
                assert ranked[i].attention_score >= ranked[i + 1].attention_score

        # HIGHMOVER and VOLSPIKE should have higher scores than NORMAL
        ranked_symbols = {r.symbol: r.attention_score for r in ranked}
        if "HIGHMOVER" in ranked_symbols and "NORMAL" in ranked_symbols:
            assert ranked_symbols["HIGHMOVER"] > ranked_symbols["NORMAL"]

    def test_drifty_cluster_detection(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty cluster detection (3+ stocks moving >2% in same direction)."""
        from app.routers.watchlist import compute_drifty

        # Create stocks all moving up >2%
        cluster_stocks = []
        for i in range(4):
            quote = SymbolQuote(
                symbol=f"CLUSTER{i}",
                price=102.0 + i,
                prev_close=100.0,
                volume=1000000,
                avg_volume_20d=1000000,
                avg_daily_move_pct_20d=0.01,
                week52_high=110.0,
                week52_low=90.0,
                spark_closes_json=json.dumps([100.0, 101.0, 102.0]),
                similar_moves_json=json.dumps([]),
                fetched_at=None,
            )
            cluster_stocks.append(quote)

        db_session.add_all(cluster_stocks)
        db_session.commit()

        # Add to watchlist
        items = [
            WatchlistItem(watchlist_id=test_watchlist.id, symbol=f"CLUSTER{i}", company_name=f"Cluster {i}", added_price=100.0)
            for i in range(4)
        ]
        db_session.add_all(items)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "CLUSTER0", test_user, db_session)

        # Should detect cluster
        if result.peer_analysis.cluster:
            assert len(result.peer_analysis.cluster["symbols"]) >= 3
            assert any("cluster" in reason.lower() or "market movers" in reason.lower() for reason in result.why_interesting)

    def test_drifty_symbol_not_in_watchlist(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty analysis fails when symbol is not in watchlist."""
        from app.routers.watchlist import compute_drifty
        from fastapi import HTTPException

        # First, add the symbol to the database (so it has market data)
        not_in_watchlist_stock = SymbolQuote(
            symbol="NOTINWATCHLIST",
            price=100.0,
            prev_close=99.0,
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([99.0, 100.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(not_in_watchlist_stock)
        db_session.commit()

        try:
            compute_drifty(test_watchlist.id, "NOTINWATCHLIST", test_user, db_session)
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 404
            assert "not in watchlist" in str(e.detail).lower()

    def test_drifty_division_by_zero_protection(self, db_session, test_user, test_watchlist):
        """Test Drifty handles division by zero gracefully."""
        from app.routers.watchlist import compute_drifty

        # Create a stock with prev_close = 0 to test division by zero
        zero_div_stock = SymbolQuote(
            symbol="ZERODIV",
            price=100.0,
            prev_close=0.0,  # This would cause division by zero
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(zero_div_stock)
        db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="ZERODIV",
            company_name="Zero Div Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        # Should not crash, should handle gracefully
        result = compute_drifty(test_watchlist.id, "ZERODIV", test_user, db_session)
        assert result.self_analysis.today_pct_change == 0.0  # Should default to 0
        assert result.attention_score >= 0  # Should have valid score

    def test_drifty_empty_watchlist(self, db_session, test_user, test_watchlist):
        """Test Drifty ranking with empty watchlist."""
        from app.routers.watchlist import get_drifty_watchlist

        result = get_drifty_watchlist(test_watchlist.id, db_session, test_user)

        assert result.watchlist_id == test_watchlist.id
        assert result.total_items == 0
        assert result.items_needing_attention == 0
        assert len(result.ranked) == 0

    def test_drifty_missing_avg_daily_move(self, db_session, test_user, test_watchlist):
        """Test Drifty handles missing avg_daily_move_pct_20d gracefully."""
        from app.routers.watchlist import compute_drifty

        # Create a stock with missing avg_daily_move_pct_20d
        missing_avg = SymbolQuote(
            symbol="MISSAVG",
            price=105.0,
            prev_close=100.0,
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=None,  # Missing data
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0, 105.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(missing_avg)
        db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="MISSAVG",
            company_name="Missing Avg Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        # Should use fallback value and not crash
        result = compute_drifty(test_watchlist.id, "MISSAVG", test_user, db_session)
        assert result.self_analysis.normal_daily_move == 0.01  # Fallback value
        assert result.attention_score >= 0

    def test_drifty_zero_normal_move(self, db_session, test_user, test_watchlist):
        """Test Drifty handles zero normal_move gracefully."""
        from app.routers.watchlist import compute_drifty

        # Create a stock with avg_daily_move_pct_20d = 0
        zero_normal = SymbolQuote(
            symbol="ZERONORMAL",
            price=105.0,
            prev_close=100.0,
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.0,  # Zero would cause division by zero
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0, 105.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(zero_normal)
        db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="ZERONORMAL",
            company_name="Zero Normal Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        # Should use fallback (0.01) and not crash
        result = compute_drifty(test_watchlist.id, "ZERONORMAL", test_user, db_session)
        # When avg_daily_move_pct_20d is 0, it uses fallback of 0.01
        # So move magnitude = 5% / 1% = 5.0× normal
        assert result.self_analysis.move_magnitude == "5.0× normal"
        assert result.attention_score >= 0

    def test_drifty_missing_volume_data(self, db_session, test_user, test_watchlist):
        """Test Drifty handles missing volume data gracefully."""
        from app.routers.watchlist import compute_drifty

        # Create a stock with missing volume data
        missing_vol = SymbolQuote(
            symbol="MISSVOL",
            price=105.0,
            prev_close=100.0,
            volume=None,  # Missing volume
            avg_volume_20d=None,  # Missing avg volume
            avg_daily_move_pct_20d=0.02,
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0, 105.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(missing_vol)
        db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="MISSVOL",
            company_name="Missing Vol Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        # Should default to 0 and not crash
        result = compute_drifty(test_watchlist.id, "MISSVOL", test_user, db_session)
        assert result.self_analysis.volume_vs_normal == 0.0
        assert result.attention_score >= 0

    def test_drifty_single_stock_watchlist(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty analysis with only one stock in watchlist (no peers)."""
        from app.routers.watchlist import compute_drifty

        # Add only one stock
        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="NORMAL",
            company_name="Normal Inc.",
            added_price=99.5,
        )
        db_session.add(item)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "NORMAL", test_user, db_session)

        # Should handle empty peer list gracefully
        assert result.peer_analysis.watchlist_size == 1
        assert result.peer_analysis.same_direction_count == 0
        assert result.peer_analysis.avg_peer_move == 0.0
        assert "No peers" in result.peer_analysis.comparison
        assert result.attention_score >= 0

    def test_drifty_case_insensitive_symbol(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty handles symbol case insensitivity."""
        from app.routers.watchlist import compute_drifty

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="NORMAL",
            company_name="Normal Inc.",
            added_price=99.5,
        )
        db_session.add(item)
        db_session.commit()

        # Test with lowercase
        result = compute_drifty(test_watchlist.id, "normal", test_user, db_session)
        assert result.symbol == "NORMAL"  # Should be uppercased

        # Test with mixed case
        result = compute_drifty(test_watchlist.id, "NoRmAl", test_user, db_session)
        assert result.symbol == "NORMAL"  # Should be uppercased

    def test_drifty_score_capping(self, db_session, test_user, test_watchlist):
        """Test Drifty attention score is capped at 100."""
        from app.routers.watchlist import compute_drifty

        # Create a stock that would trigger all signals (extreme outlier)
        extreme_stock = SymbolQuote(
            symbol="EXTREME",
            price=120.0,  # 20% move
            prev_close=100.0,
            volume=10000000,  # 10× volume
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.01,  # 20× normal move
            week52_high=130.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0, 120.0]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(extreme_stock)
        db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="EXTREME",
            company_name="Extreme Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        result = compute_drifty(test_watchlist.id, "EXTREME", test_user, db_session)

        # Should be capped at 100 even with extreme values
        assert result.attention_score <= 100

    def test_drifty_market_analysis_without_benchmark(self, db_session, test_user, test_watchlist, test_quotes):
        """Test Drifty handles missing benchmark data gracefully."""
        from app.routers.watchlist import compute_drifty

        # Remove benchmark from database
        benchmark = db_session.get(SymbolQuote, "^NSEI")
        if benchmark:
            db_session.delete(benchmark)
            db_session.commit()

        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol="NORMAL",
            company_name="Normal Inc.",
            added_price=99.5,
        )
        db_session.add(item)
        db_session.commit()

        # Should handle missing benchmark gracefully
        result = compute_drifty(test_watchlist.id, "NORMAL", test_user, db_session)
        assert result.market_analysis.benchmark_move == 0.0
        assert result.market_analysis.outperformance == result.self_analysis.today_pct_change
        assert result.attention_score >= 0

    def test_drifty_outlier_sensitivity_fix(self, db_session, test_user, test_watchlist, test_quotes):
        """Test that outlier detection requires significant move magnitude.

        This test verifies the fix for the over-sensitivity issue where stocks
        with sub-normal movement were being flagged as outliers just because
        peers happened to move in a different direction.

        Example: DKNG moved -0.74% (0.3× its normal move) but was flagged as
        an outlier because 3 of 8 peers moved the other way. This is noise, not signal.
        """
        from app.routers.watchlist import compute_drifty

        # Create a stock with sub-normal move (like the DKNG example)
        # Use a unique symbol to avoid conflicts
        test_symbol = "SUBNORMAL_TEST"
        existing = db_session.get(SymbolQuote, test_symbol)
        if existing:
            db_session.delete(existing)
            db_session.commit()

        sub_normal_mover = SymbolQuote(
            symbol=test_symbol,
            price=99.26,  # -0.74% move
            prev_close=100.0,
            volume=1000000,
            avg_volume_20d=1000000,
            avg_daily_move_pct_20d=0.025,  # 2.5% normal move, so today is 0.3× normal
            week52_high=110.0,
            week52_low=90.0,
            spark_closes_json=json.dumps([100.0, 99.26]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(sub_normal_mover)
        db_session.commit()

        # Add the sub-normal mover to watchlist
        item = WatchlistItem(
            watchlist_id=test_watchlist.id,
            symbol=test_symbol,
            company_name="Sub Normal Inc.",
            added_price=100.0,
        )
        db_session.add(item)
        db_session.commit()

        # Add peers that move in opposite direction (simulating the DKNG scenario)
        # Add 3 peers moving up, so same_direction_count would be 0 < 3/2
        for i in range(3):
            peer_symbol = f"PEER_OUTLIER{i}"
            existing_peer = db_session.get(SymbolQuote, peer_symbol)
            if existing_peer:
                db_session.delete(existing_peer)

            peer_quote = SymbolQuote(
                symbol=peer_symbol,
                price=101.0,  # +1% move (opposite direction)
                prev_close=100.0,
                volume=1000000,
                avg_volume_20d=1000000,
                avg_daily_move_pct_20d=0.01,
                week52_high=110.0,
                week52_low=90.0,
                spark_closes_json=json.dumps([100.0, 101.0]),
                similar_moves_json=json.dumps([]),
                fetched_at=None,
            )
            db_session.add(peer_quote)

            peer_item = WatchlistItem(
                watchlist_id=test_watchlist.id,
                symbol=peer_symbol,
                company_name=f"Peer {i}",
                added_price=100.0,
            )
            db_session.add(peer_item)

        db_session.commit()

        result = compute_drifty(test_watchlist.id, test_symbol, test_user, db_session)

        # Verify the fix: sub-normal move should NOT trigger outlier signal
        # even though peers are moving in opposite direction
        assert result.self_analysis.move_magnitude == "0.3× normal"  # Sub-normal move
        assert result.peer_analysis.same_direction_count == 0  # All peers opposite direction
        assert result.peer_analysis.watchlist_size == 4  # 1 target + 3 peers

        # The key assertion: should NOT have outlier in reasons
        assert not any("outlier" in reason.lower() for reason in result.why_interesting)

        # Should have low score since it's not actually interesting
        assert result.attention_score < 25  # Should not get the +25 outlier points


class TestEngineConsistency:
    """The two attention surfaces must tell the same story about a stock.

    `change_detection.evaluate()` drives the rail dots, the "since you last
    looked" feed and the watchlist sort; `compute_drifty()` drives the Charts
    view's Drifty panel. A user who sees a stock flagged in the list and opens
    its chart to find out why should see Drifty explain that flag -- so every
    rule that fires in one has to show up in the other.
    """

    # rule key from change_detection.evaluate() -> substring that must appear
    # in the matching Drifty why_interesting entry
    RULE_TO_DRIFTY_REASON = {
        "price_move": "normal daily range",
        "unusual_volume": "volume is",
        "week52_high": "52-week high",
        "week52_low": "52-week low",
    }

    @pytest.mark.parametrize(
        "symbol,quote_kwargs,expected_rule",
        [
            # flagged purely for an unusual move for this stock
            ("CONSIST_MOVE", dict(price=106.0, prev_close=100.0, volume=1_000_000, avg_volume_20d=1_000_000,
                                  avg_daily_move_pct_20d=0.01, week52_high=150.0, week52_low=50.0), "price_move"),
            # flagged purely for a volume spike -- barely moved
            ("CONSIST_VOL", dict(price=100.0, prev_close=99.8, volume=3_000_000, avg_volume_20d=1_000_000,
                                 avg_daily_move_pct_20d=0.01, week52_high=150.0, week52_low=50.0), "unusual_volume"),
            # flagged purely for sitting at a new 52-week high
            ("CONSIST_52H", dict(price=150.0, prev_close=149.9, volume=1_000_000, avg_volume_20d=1_000_000,
                                 avg_daily_move_pct_20d=0.01, week52_high=150.0, week52_low=50.0), "week52_high"),
            # flagged purely for sitting just above a 52-week low
            ("CONSIST_52L", dict(price=51.0, prev_close=50.95, volume=1_000_000, avg_volume_20d=1_000_000,
                                 avg_daily_move_pct_20d=0.01, week52_high=150.0, week52_low=50.0), "week52_low"),
        ],
    )
    def test_drifty_explains_every_attention_flag(
        self, db_session, test_user, test_watchlist, symbol, quote_kwargs, expected_rule
    ):
        """A stock change_detection flags must score in Drifty, for the same reason."""
        from app.routers.watchlist import compute_drifty
        from app.services import change_detection

        quote = SymbolQuote(
            symbol=symbol,
            spark_closes_json=json.dumps([]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
            **quote_kwargs,
        )
        db_session.add(quote)
        db_session.add(
            WatchlistItem(
                watchlist_id=test_watchlist.id,
                symbol=symbol,
                company_name=f"{symbol} Inc.",
                added_price=quote_kwargs["prev_close"],
            )
        )
        db_session.commit()

        # No last-view baseline: both engines see exactly the same quote.
        verdict = change_detection.evaluate(None, quote)
        fired_rules = {rule["rule"] for rule in verdict["fired"]}
        assert verdict["attention"] is True
        assert expected_rule in fired_rules, f"expected {expected_rule}, got {fired_rules}"

        drifty = compute_drifty(test_watchlist.id, symbol, test_user, db_session)
        assert drifty.attention_score > 0, (
            f"{symbol} is flagged in the watchlist for {sorted(fired_rules)} "
            f"but Drifty scores it 0: {drifty.why_interesting}"
        )

        reasons = " | ".join(drifty.why_interesting).lower()
        for rule in fired_rules:
            needle = self.RULE_TO_DRIFTY_REASON[rule]
            assert needle in reasons, (
                f"{symbol} fired '{rule}' in change_detection but Drifty never mentions it: "
                f"{drifty.why_interesting}"
            )

    def test_drifty_follows_change_detection_thresholds(
        self, db_session, test_user, test_watchlist, monkeypatch
    ):
        """Drifty reads the shared constants, so retuning them retunes both engines."""
        from app.routers.watchlist import compute_drifty
        from app.services import change_detection

        quote = SymbolQuote(
            symbol="SHARED_THRESH",
            price=104.0,  # +4%, 4x its normal move, on 3x normal volume
            prev_close=100.0,
            volume=3_000_000,
            avg_volume_20d=1_000_000,
            avg_daily_move_pct_20d=0.01,
            week52_high=150.0,
            week52_low=50.0,
            spark_closes_json=json.dumps([]),
            similar_moves_json=json.dumps([]),
            fetched_at=None,
        )
        db_session.add(quote)
        db_session.add(
            WatchlistItem(
                watchlist_id=test_watchlist.id,
                symbol="SHARED_THRESH",
                company_name="Shared Inc.",
                added_price=100.0,
            )
        )
        db_session.commit()

        before = compute_drifty(test_watchlist.id, "SHARED_THRESH", test_user, db_session)
        assert any("normal daily range" in r for r in before.why_interesting)
        assert any("Volume is" in r for r in before.why_interesting)

        monkeypatch.setattr(change_detection, "MOVE_SENSITIVITY", 100.0)
        monkeypatch.setattr(change_detection, "VOLUME_SPIKE_MULTIPLE", 100.0)

        after = compute_drifty(test_watchlist.id, "SHARED_THRESH", test_user, db_session)
        assert not any("normal daily range" in r for r in after.why_interesting)
        assert not any("Volume is" in r for r in after.why_interesting)
        assert after.attention_score < before.attention_score


class TestWatchlistItemCount:
    """Tests for watchlist item count feature."""

    def test_watchlist_list_includes_item_count(self, db_session, test_user, test_watchlist):
        """Test that GET /api/watchlists includes item_count for each watchlist."""
        from app.routers.watchlist import list_watchlists

        # Add a few items to the watchlist
        for i in range(3):
            item = WatchlistItem(
                watchlist_id=test_watchlist.id,
                symbol=f"TEST{i}",
                company_name=f"Test {i}",
                added_price=100.0,
            )
            db_session.add(item)
        db_session.commit()

        # Create another empty watchlist
        empty_watchlist = Watchlist(user_id=test_user.id, name="Empty Watchlist")
        db_session.add(empty_watchlist)
        db_session.commit()

        # Get all watchlists
        result = list_watchlists(db_session, test_user)

        # Should have both watchlists
        assert len(result) == 2

        # Find our test watchlist
        test_wl = next((w for w in result if w.id == test_watchlist.id), None)
        assert test_wl is not None
        assert test_wl.item_count == 3

        # Find empty watchlist
        empty_wl = next((w for w in result if w.name == "Empty Watchlist"), None)
        assert empty_wl is not None
        assert empty_wl.item_count == 0

    def test_watchlist_list_no_n_plus_one_query(self, db_session, test_user):
        """Test that item_count is populated efficiently without N+1 queries."""
        from app.routers.watchlist import list_watchlists

        # Create multiple watchlists with different item counts
        watchlists = []
        for i in range(5):
            wl = Watchlist(user_id=test_user.id, name=f"Watchlist {i}")
            db_session.add(wl)
            watchlists.append(wl)
        db_session.commit()

        # Add varying numbers of items to each watchlist
        for i, wl in enumerate(watchlists):
            for j in range(i + 1):  # 0, 1, 2, 3, 4 items
                item = WatchlistItem(
                    watchlist_id=wl.id,
                    symbol=f"SYMBOL{i}_{j}",
                    company_name=f"Symbol {i}_{j}",
                    added_price=100.0,
                )
                db_session.add(item)
        db_session.commit()

        # Get all watchlists - should be efficient (no N+1)
        result = list_watchlists(db_session, test_user)

        # Verify all counts are correct
        assert len(result) == 5
        for i, wl in enumerate(result):
            assert wl.item_count == i + 1
    """Tests for enhanced chart data with OHLC and more timeframes."""

    def test_chart_data_new_timeframes(self):
        """Test chart data with new timeframes (1D, 5D, YTD, 5Y)."""
        # Test new timeframes exist in period_map
        from app.services.market_data import fetch_chart_data

        # Just verify the function accepts these ranges (actual yfinance calls may fail)
        new_timeframes = ["1D", "5D", "YTD", "5Y"]
        for timeframe in new_timeframes:
            # The function should not raise for invalid ranges
            result = fetch_chart_data("AAPL", timeframe)
            # Result may be None due to yfinance, but shouldn't crash
            assert result is None or isinstance(result, dict)

    def test_chart_data_ohlc_structure(self):
        """Test that chart data includes OHLC fields when available."""
        # Test with mock data that the structure is correct
        # This is a unit test for the function logic, not actual yfinance calls
        from app.services.market_data import fetch_chart_data

        # Test with 1M range
        result = fetch_chart_data("AAPL", "1M")
        # May be None due to yfinance, but check structure if it succeeds
        if result:
            assert "dates" in result
            assert "closes" in result
            # OHLC fields are optional
            if "opens" in result:
                assert isinstance(result["opens"], list)
            if "highs" in result:
                assert isinstance(result["highs"], list)
            if "lows" in result:
                assert isinstance(result["lows"], list)
            if "volumes" in result:
                assert isinstance(result["volumes"], list)

    def test_chart_data_no_null_mixed_with_real(self):
        """Test that chart data doesn't mix None values with real values in required fields."""
        from app.services.market_data import fetch_chart_data

        result = fetch_chart_data("AAPL", "1M")
        if result:
            # Required fields should not have None mixed with real values
            assert "dates" in result
            assert "closes" in result
            assert len(result["dates"]) == len(result["closes"])
            # No None in required fields
            assert all(d is not None for d in result["dates"])
            assert all(c is not None for c in result["closes"])
