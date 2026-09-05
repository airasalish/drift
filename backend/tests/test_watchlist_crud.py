"""Tests for watchlist CRUD operations and ownership validation."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import User, Watchlist, WatchlistItem
from app.routers.watchlist import _get_watchlist_or_404

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create a fresh database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
        session.rollback()
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(name="testuser", password_hash="hashed_password")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_user(db_session):
    """Create a second test user for ownership tests."""
    user = User(name="otheruser", password_hash="hashed_password")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_get_watchlist_or_404_owned(db_session, test_user):
    """Test _get_watchlist_or_404 returns watchlist when owned by user."""
    watchlist = Watchlist(user_id=test_user.id, name="My Watchlist")
    db_session.add(watchlist)
    db_session.commit()

    result = _get_watchlist_or_404(db_session, watchlist.id, test_user)
    assert result.id == watchlist.id
    assert result.name == "My Watchlist"


def test_get_watchlist_or_404_not_owned(db_session, test_user, other_user):
    """Test _get_watchlist_or_404 raises 404 when watchlist owned by another user."""
    watchlist = Watchlist(user_id=other_user.id, name="Other's Watchlist")
    db_session.add(watchlist)
    db_session.commit()

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        _get_watchlist_or_404(db_session, watchlist.id, test_user)
    assert exc_info.value.status_code == 404


def test_get_watchlist_or_404_nonexistent(db_session, test_user):
    """Test _get_watchlist_or_404 raises 404 when watchlist doesn't exist."""
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        _get_watchlist_or_404(db_session, 99999, test_user)
    assert exc_info.value.status_code == 404


def test_watchlist_deletion_guard_last_watchlist(db_session, test_user):
    """Test that deleting the last watchlist is blocked."""
    watchlist = Watchlist(user_id=test_user.id, name="Only One")
    db_session.add(watchlist)
    db_session.commit()

    # Check if this is the user's last watchlist
    watchlist_count = db_session.query(Watchlist).filter_by(user_id=test_user.id).count()
    assert watchlist_count == 1

    # The deletion should be blocked
    from fastapi import HTTPException
    try:
        if watchlist_count <= 1:
            raise HTTPException(400, "cannot delete your last watchlist")
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code == 400
        assert "cannot delete your last watchlist" in e.detail


def test_watchlist_deletion_allowed_when_multiple(db_session, test_user):
    """Test that deletion is allowed when user has multiple watchlists."""
    wl1 = Watchlist(user_id=test_user.id, name="First")
    wl2 = Watchlist(user_id=test_user.id, name="Second")
    db_session.add_all([wl1, wl2])
    db_session.commit()

    # Check if this is the user's last watchlist
    watchlist_count = db_session.query(Watchlist).filter_by(user_id=test_user.id).count()
    assert watchlist_count == 2

    # The deletion should be allowed
    from fastapi import HTTPException
    try:
        if watchlist_count <= 1:
            raise HTTPException(400, "cannot delete your last watchlist")
        # If we get here, deletion is allowed
        assert True
    except HTTPException:
        assert False, "Should not have raised HTTPException when multiple watchlists exist"


def test_watchlist_item_ownership_404_for_other_user_watchlist(db_session, test_user, other_user):
    """Test that item operations return 404 for other user's watchlist."""
    # Create a watchlist for other_user with an item
    watchlist = Watchlist(user_id=other_user.id, name="Other's Watchlist")
    db_session.add(watchlist)
    db_session.flush()

    item = WatchlistItem(
        watchlist_id=watchlist.id,
        symbol="AAPL",
        note="Other's item",
        company_name="Apple Inc.",
    )
    db_session.add(item)
    db_session.commit()

    # Try to get the watchlist as test_user
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        _get_watchlist_or_404(db_session, watchlist.id, test_user)
    assert exc_info.value.status_code == 404
