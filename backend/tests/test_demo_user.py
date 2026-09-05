"""Tests for backend/app/demo_user.py's backfill_company_websites.

Uses an isolated in-memory SQLite engine (not the module-level `engine`
from app.database) so this never touches a real dev database, and
monkeypatches lookup_company_website so the test suite stays offline --
no real yfinance network calls in a unit test.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.demo_user import backfill_company_websites
from app.models import User, Watchlist, WatchlistItem
import app.demo_user as demo_user_module


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def seed_item(db, symbol: str, company_website) -> WatchlistItem:
    user = User(name=f"user-{symbol}", password_hash=None)
    db.add(user)
    db.flush()
    watchlist = Watchlist(user_id=user.id, name="My Watchlist")
    db.add(watchlist)
    db.flush()
    item = WatchlistItem(watchlist_id=watchlist.id, symbol=symbol, company_website=company_website)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_backfills_only_rows_missing_a_website(monkeypatch):
    db = make_session()
    stale = seed_item(db, "AAPL", company_website=None)
    already_set = seed_item(db, "TSLA", company_website="tesla.com")

    calls = []

    def fake_lookup(symbol: str):
        calls.append(symbol)
        return "apple.com"

    monkeypatch.setattr(demo_user_module, "lookup_company_website", fake_lookup)

    backfill_company_websites(db)

    db.refresh(stale)
    db.refresh(already_set)
    assert stale.company_website == "apple.com"
    assert already_set.company_website == "tesla.com"  # untouched -- already had a value
    assert calls == ["AAPL"]  # never re-looked-up the row that already had one


def test_noop_when_nothing_is_missing(monkeypatch):
    db = make_session()
    seed_item(db, "NVDA", company_website="nvidia.com")

    def fail_if_called(symbol: str):
        raise AssertionError("should not be called when nothing is missing")

    monkeypatch.setattr(demo_user_module, "lookup_company_website", fail_if_called)

    backfill_company_websites(db)  # must not raise


def test_a_lookup_that_returns_none_is_stored_as_none_not_left_stale_forever(monkeypatch):
    # a genuine miss (no website on file for this symbol) is a real,
    # honest None -- not an error, and not something this function should
    # retry indefinitely within a single call
    db = make_session()
    item = seed_item(db, "ZETA", company_website=None)

    monkeypatch.setattr(demo_user_module, "lookup_company_website", lambda symbol: None)

    backfill_company_websites(db)

    db.refresh(item)
    assert item.company_website is None
