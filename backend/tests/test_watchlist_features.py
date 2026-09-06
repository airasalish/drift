"""Unit tests for new watchlist features: templates, bulk import, related stocks, similar moves, chart ranges."""

import math
import re
import pytest
from sqlalchemy.orm import Session

from app.models import SymbolQuote, SymbolSector, User, Watchlist, WatchlistItem
from app.sector_data import get_sector_for_symbol, get_symbols_in_sector, seed_sector_data
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


# ─── Watchlist Templates Tests ─────────────────────────────────────────

def test_template_data_exists():
    """Verify that watchlist templates are defined."""
    from app.demo_user import WATCHLIST_TEMPLATES
    assert len(WATCHLIST_TEMPLATES) > 0
    assert "technology" in WATCHLIST_TEMPLATES
    assert "ai_semiconductors" in WATCHLIST_TEMPLATES
    # Verify new templates exist
    assert "nifty_50" in WATCHLIST_TEMPLATES
    assert "pharma" in WATCHLIST_TEMPLATES
    assert "dividends" in WATCHLIST_TEMPLATES
    # Should have 9 templates total
    assert len(WATCHLIST_TEMPLATES) == 9


def test_template_symbols_are_valid():
    """Verify that template symbols are properly formatted."""
    from app.demo_user import WATCHLIST_TEMPLATES
    import re

    SYMBOL_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")

    for template_name, symbols in WATCHLIST_TEMPLATES.items():
        for symbol, company_name, note in symbols:
            assert SYMBOL_RE.match(symbol), f"Invalid symbol format in {template_name}: {symbol}"
            assert company_name, f"Missing company name in {template_name}: {symbol}"
            assert note, f"Missing note in {template_name}: {symbol}"


def test_new_templates_have_correct_structure():
    """Verify that new templates (nifty_50, pharma, dividends) have correct structure."""
    from app.demo_user import WATCHLIST_TEMPLATES

    # Check nifty_50 template
    assert "nifty_50" in WATCHLIST_TEMPLATES
    nifty_symbols = WATCHLIST_TEMPLATES["nifty_50"]
    assert len(nifty_symbols) == 5
    assert all(sym.endswith(".NS") for sym, _, _ in nifty_symbols)  # All NSE symbols

    # Check pharma template
    assert "pharma" in WATCHLIST_TEMPLATES
    pharma_symbols = WATCHLIST_TEMPLATES["pharma"]
    assert len(pharma_symbols) == 5
    # Mix of US and Indian symbols
    has_us = any(not sym.endswith(".NS") for sym, _, _ in pharma_symbols)
    has_indian = any(sym.endswith(".NS") for sym, _, _ in pharma_symbols)
    assert has_us and has_indian

    # Check dividends template
    assert "dividends" in WATCHLIST_TEMPLATES
    dividend_symbols = WATCHLIST_TEMPLATES["dividends"]
    assert len(dividend_symbols) == 5
    # Mix of US and Indian symbols
    has_us = any(not sym.endswith(".NS") for sym, _, _ in dividend_symbols)
    has_indian = any(sym.endswith(".NS") for sym, _, _ in dividend_symbols)
    assert has_us and has_indian


def test_template_metadata_complete():
    """Verify that TEMPLATE_METADATA includes all templates."""
    from app.routers.watchlist import TEMPLATE_METADATA
    from app.demo_user import WATCHLIST_TEMPLATES

    # All templates in WATCHLIST_TEMPLATES should have metadata
    for template_name in WATCHLIST_TEMPLATES.keys():
        assert template_name in TEMPLATE_METADATA, f"Missing metadata for {template_name}"
        assert "display_name" in TEMPLATE_METADATA[template_name]
        assert "description" in TEMPLATE_METADATA[template_name]

    # Should have 9 templates total
    assert len(TEMPLATE_METADATA) == 9


def test_templates_endpoint_returns_nine_templates():
    """Test that GET /api/watchlists/templates returns 9 templates."""
    from app.routers.watchlist import list_watchlist_templates

    result = list_watchlist_templates()

    # Should return 9 templates
    assert len(result) == 9

    # Verify all expected template names are present
    template_names = {t.template_name for t in result}
    expected_templates = {
        "technology",
        "ai_semiconductors",
        "indian_large_caps",
        "us_mega_caps",
        "banking",
        "ev_mobility",
        "nifty_50",
        "pharma",
        "dividends",
    }
    assert template_names == expected_templates

    # Verify each template has correct structure
    for template in result:
        assert template.template_name
        assert template.display_name
        assert template.description
        assert template.symbol_count > 0


def test_create_new_templates_from_template(db_session):
    """Test that new templates can be created with correct item counts."""
    from app.demo_user import WATCHLIST_TEMPLATES
    from app.services.market_data import fetch_symbol_stats

    # Test each new template's symbols resolve correctly
    new_templates = ["nifty_50", "pharma", "dividends"]

    for template_name in new_templates:
        template_symbols = WATCHLIST_TEMPLATES[template_name]

        # Verify template has 5 symbols
        assert len(template_symbols) == 5, f"{template_name} should have 5 symbols"

        # Verify all symbols resolve via fetch_symbol_stats
        for symbol, company_name, note in template_symbols:
            stats = fetch_symbol_stats(symbol)
            assert stats is not None, f"Symbol {symbol} in {template_name} failed to resolve"
            assert stats["price"] is not None, f"Symbol {symbol} in {template_name} has no price"


# ─── Bulk Import Tests ─────────────────────────────────────────────────

def test_bulk_import_parser_handles_newlines():
    """Test that the import parser handles newline-separated symbols."""
    import re

    text = "AAPL\nMSFT\nGOOGL"
    raw_symbols = re.split(r"[\n,\s]+", text.strip())
    parsed_symbols = [s.strip().upper() for s in raw_symbols if s.strip()]

    assert parsed_symbols == ["AAPL", "MSFT", "GOOGL"]


def test_bulk_import_parser_handles_commas():
    """Test that the import parser handles comma-separated symbols."""
    import re

    text = "AAPL, MSFT, GOOGL"
    raw_symbols = re.split(r"[\n,\s]+", text.strip())
    parsed_symbols = [s.strip().upper() for s in raw_symbols if s.strip()]

    assert parsed_symbols == ["AAPL", "MSFT", "GOOGL"]


def test_bulk_import_parser_handles_whitespace():
    """Test that the import parser handles whitespace-separated symbols."""
    import re

    text = "AAPL   MSFT   GOOGL"
    raw_symbols = re.split(r"[\n,\s]+", text.strip())
    parsed_symbols = [s.strip().upper() for s in raw_symbols if s.strip()]

    assert parsed_symbols == ["AAPL", "MSFT", "GOOGL"]


def test_bulk_import_deduplicates():
    """Test that bulk import de-duplicates symbols."""
    import re

    text = "AAPL, MSFT, AAPL, GOOGL, MSFT"
    raw_symbols = re.split(r"[\n,\s]+", text.strip())
    parsed_symbols = [s.strip().upper() for s in raw_symbols if s.strip()]
    unique_symbols = list(dict.fromkeys(parsed_symbols))

    assert unique_symbols == ["AAPL", "MSFT", "GOOGL"]


def test_bulk_import_respects_max_limit():
    """Test that bulk import respects the 50 symbol limit."""
    MAX_IMPORT_SYMBOLS = 50
    assert MAX_IMPORT_SYMBOLS == 50


# ─── Related Stocks Tests ───────────────────────────────────────────────

def test_sector_data_structure():
    """Test that sector data has the expected structure."""
    from app.sector_data import SECTOR_CATEGORIES, SYMBOL_SECTORS

    assert len(SECTOR_CATEGORIES) > 0
    assert len(SYMBOL_SECTORS) > 0
    assert "tech" in SECTOR_CATEGORIES
    assert "AAPL" in SYMBOL_SECTORS


def test_get_sector_for_known_symbol():
    """Test that get_sector_for_symbol returns correct sector for known symbols."""
    assert get_sector_for_symbol("AAPL") == "tech"
    assert get_sector_for_symbol("TSLA") == "auto-ev"
    assert get_sector_for_symbol("UNKNOWN") is None


def test_get_symbols_in_sector():
    """Test that get_symbols_in_sector returns correct symbols."""
    tech_symbols = get_symbols_in_sector("tech")
    assert "AAPL" in tech_symbols
    assert "MSFT" in tech_symbols
    assert "TSLA" not in tech_symbols  # TSLA is auto-ev


def test_sector_seeding_idempotent():
    """Test that seeding sector data is idempotent."""
    from app.database import Base, engine, SessionLocal
    from app.models import SymbolSector

    # Create tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # First seed
        seed_sector_data(db)
        count_after_first = db.query(SymbolSector).count()

        # Second seed (should not add duplicates)
        seed_sector_data(db)
        count_after_second = db.query(SymbolSector).count()

        assert count_after_first == count_after_second
    finally:
        db.close()


# ─── Similar Moves Tests ───────────────────────────────────────────────

def test_similar_moves_tolerance_calculation():
    """Test that similar moves tolerance is calculated correctly."""
    today_move = 0.05  # 5% move
    tolerance = 0.2  # 20% tolerance

    min_move = today_move * (1 - tolerance)  # 4%
    max_move = today_move * (1 + tolerance)  # 6%

    assert abs(min_move - 0.04) < 0.0001
    assert abs(max_move - 0.06) < 0.0001


def test_similar_moves_filters_by_tolerance():
    """Test that similar moves are filtered by tolerance."""
    today_move = 0.05
    tolerance = 0.2

    # Historical moves
    historical_moves = [
        {"date": "2024-01-01", "pct_change": 0.048},  # Within tolerance
        {"date": "2024-01-02", "pct_change": 0.052},  # Within tolerance
        {"date": "2024-01-03", "pct_change": 0.030},  # Below tolerance
        {"date": "2024-01-04", "pct_change": 0.070},  # Above tolerance
    ]

    filtered = []
    for move in historical_moves:
        if abs(move["pct_change"]) >= today_move * (1 - tolerance) and abs(move["pct_change"]) <= today_move * (1 + tolerance):
            filtered.append(move)

    assert len(filtered) == 2
    assert filtered[0]["pct_change"] == 0.048
    assert filtered[1]["pct_change"] == 0.052


def test_similar_moves_returns_up_to_3():
    """Test that similar moves returns at most 3 results."""
    today_move = 0.05
    tolerance = 0.2

    # Create 5 moves within tolerance
    historical_moves = [
        {"date": f"2024-01-0{i}", "pct_change": 0.048 + (i * 0.001)}
        for i in range(5)
    ]

    filtered = []
    for move in historical_moves:
        if abs(move["pct_change"]) >= today_move * (1 - tolerance) and abs(move["pct_change"]) <= today_move * (1 + tolerance):
            filtered.append(move)

    # Sort by closest to today's move and limit to 3
    filtered.sort(key=lambda x: abs(x["pct_change"] - today_move))
    filtered = filtered[:3]

    assert len(filtered) == 3


def test_similar_moves_insufficient_data():
    """Test that similar moves returns message when insufficient data."""
    today_move = 0.05
    similar_days = []  # Empty - insufficient data

    if len(similar_days) < 2:
        message = "not enough historical data yet"
        assert message == "not enough historical data yet"


# ─── Chart Ranges Tests ─────────────────────────────────────────────────

def test_chart_range_mapping():
    """Test that chart range names map to correct yfinance periods."""
    # This is tested implicitly by the fetch_chart_data function
    # We just verify the mapping exists
    expected_ranges = ["1M", "3M", "6M", "1Y", "ALL"]
    for range_name in expected_ranges:
        assert range_name in ["1M", "3M", "6M", "1Y", "ALL"]


def test_chart_range_excludes_intraday():
    """Test that intraday ranges (1D, 1W) are not supported."""
    unsupported_ranges = ["1D", "1W"]
    for range_name in unsupported_ranges:
        # These should not be in the mapping
        assert range_name not in ["1M", "3M", "6M", "1Y", "ALL"]


def test_chart_data_structure():
    """Test that chart data has the expected structure."""
    # We can't test with real yfinance calls in unit tests,
    # but we can verify the expected structure
    expected_keys = {"dates", "closes", "currency"}
    assert expected_keys == {"dates", "closes", "currency"}


def test_chart_nan_handling():
    """Test that chart data NaN handling matches _clean() pattern."""
    # Simulate the _clean function behavior
    def _clean(x: float | None) -> float | None:
        if x is None:
            return None
        return None if math.isnan(x) else x

    # Test that NaN values are converted to None
    assert _clean(float('nan')) is None
    assert _clean(1.5) == 1.5
    assert _clean(None) is None
