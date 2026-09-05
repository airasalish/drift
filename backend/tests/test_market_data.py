"""domain_from_website is pure string parsing -- no yfinance, no network."""

from app.services.market_data import domain_from_website


def test_domain_from_full_url():
    assert domain_from_website("https://www.nvidia.com/en-us/") == "nvidia.com"


def test_domain_strips_www_and_schemeless():
    assert domain_from_website("www.tesla.com") == "tesla.com"


def test_domain_none_and_garbage():
    assert domain_from_website(None) == None
    assert domain_from_website("") == None
    assert domain_from_website("   ") == None
