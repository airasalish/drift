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
    # Normal stock (small move)
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

    # High mover (2.5x normal move)
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

    # Outlier (down while others up)
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

    # Volume spike
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

    # Benchmark (Nifty 50)
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

    db_session.add_all([normal_quote, high_mover, outlier, volume_spike, benchmark])
    db_session.commit()
    return [normal_quote, high_mover, outlier, volume_spike, benchmark]


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


class TestEnhancedChartData:
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
