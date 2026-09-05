"""Hand-checked sector tags for related stocks (same-sector only, not correlation).

These are manual assignments based on real company classifications, not computed
correlation. Used only for the "related stocks" feature - never fabricate relationships.
"""

# Sector categories matching the frontend's suggested companies categories
SECTOR_CATEGORIES = {
    "tech": "Technology",
    "auto-ev": "Auto & EV",
    "gaming-entertainment": "Gaming & Entertainment",
    "consumer-retail": "Consumer & Retail",
    "industrial-energy": "Industrial & Energy",
    "travel-transport": "Travel & Transport",
}

# Manual sector assignments for common symbols
# This is a deliberately small, hand-checked set - not an exhaustive mapping
SYMBOL_SECTORS = {
    # Technology
    "AAPL": "tech",
    "MSFT": "tech",
    "GOOGL": "tech",
    "META": "tech",
    "AMZN": "tech",
    "NVDA": "tech",
    "AMD": "tech",
    "INTC": "tech",
    "TSM": "tech",
    "ASML": "tech",

    # Auto & EV
    "TSLA": "auto-ev",
    "BYDDY": "auto-ev",
    "NIO": "auto-ev",
    "LCID": "auto-ev",
    "RIVN": "auto-ev",
    "F": "auto-ev",
    "GM": "auto-ev",

    # Gaming & Entertainment
    "EA": "gaming-entertainment",
    "RBLX": "gaming-entertainment",
    "DKNG": "gaming-entertainment",
    "TTWO": "gaming-entertainment",
    "ATVI": "gaming-entertainment",

    # Consumer & Retail
    "WMT": "consumer-retail",
    "COST": "consumer-retail",
    "TGT": "consumer-retail",
    "HD": "consumer-retail",
    "MCD": "consumer-retail",
    "SBUX": "consumer-retail",

    # Industrial & Energy
    "CAT": "industrial-energy",
    "GE": "industrial-energy",
    "BA": "industrial-energy",
    "XOM": "industrial-energy",
    "CVX": "industrial-energy",
    "COP": "industrial-energy",

    # Travel & Transport
    "DAL": "travel-transport",
    "UAL": "travel-transport",
    "AAL": "travel-transport",
    "JBLU": "travel-transport",
    "UBER": "travel-transport",
    "LYFT": "travel-transport",

    # Indian Large Caps
    "RELIANCE.NS": "industrial-energy",
    "TCS.NS": "tech",
    "INFY.NS": "tech",
    "HDFCBANK.NS": "consumer-retail",
    "ICICIBANK.NS": "consumer-retail",
    "ETERNAL.NS": "consumer-retail",
    "NYKAA.NS": "consumer-retail",
    "IRCTC.NS": "travel-transport",
    "SWIGGY.NS": "consumer-retail",
}


def get_sector_for_symbol(symbol: str) -> str | None:
    """Get sector tag for a symbol, or None if not in our manual mapping."""
    return SYMBOL_SECTORS.get(symbol.upper())


def get_symbols_in_sector(sector: str) -> list[str]:
    """Get all symbols in a given sector."""
    return [sym for sym, sec in SYMBOL_SECTORS.items() if sec == sector]


def seed_sector_data(db) -> None:
    """Populate the symbol_sectors table with our manual mappings."""
    from app.models import SymbolSector

    for symbol, sector in SYMBOL_SECTORS.items():
        existing = db.get(SymbolSector, symbol)
        if existing is None:
            db.add(SymbolSector(symbol=symbol, sector=sector))

    db.commit()
