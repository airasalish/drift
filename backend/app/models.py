import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime.datetime:
    # naive UTC, deliberately: SQLite doesn't reliably round-trip
    # timezone-aware datetimes, so every datetime in this app is naive UTC
    # by convention, everywhere (see routers/watchlist.py, services/poller.py)
    return datetime.datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    # nullable on purpose: the one seeded demo account has no password and
    # is reached via a separate no-password "try the demo" login, not
    # real credential auth -- see ENGINEERING_DECISIONS.md
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)

    watchlists: Mapped[list["Watchlist"]] = relationship(back_populates="user")


class Session(Base):
    """Opaque bearer token -> user. Deliberately not JWT: a random token in
    a DB table is simpler here (no signing-key management, trivially
    revocable by deleting the row) for the login-lifetime this project
    actually needs, at the cost of a DB lookup per request -- a real
    tradeoff, not a limitation we didn't notice.
    """

    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(), default=utcnow)


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String, default="My Watchlist")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="watchlists")
    items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan"
    )


class WatchlistItem(Base):
    """One symbol on one watchlist.

    price_at_last_view / last_viewed_at are the anchor for "what changed since
    you last checked" — they only move when the user explicitly marks the
    symbol seen, never on a background poll.
    """

    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id"))
    symbol: Mapped[str] = mapped_column(String, index=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)  # user's "why I added this"
    # captured once at add time from the symbol-search result the user
    # actually picked -- best-effort display only (ticker+company, not a
    # second source of truth), so a stale/missing value here never breaks
    # anything, it just falls back to showing the ticker alone
    company_name: Mapped[str | None] = mapped_column(String, nullable=True)
    added_at: Mapped[datetime.datetime] = mapped_column(DateTime(), default=utcnow)
    added_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    last_viewed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), nullable=True
    )
    price_at_last_view: Mapped[float | None] = mapped_column(Float, nullable=True)
    # JSON array of structural rule keys (see change_detection.evaluate) that
    # were already true the moment the user last marked this seen -- lets
    # "mark as seen" actually dismiss a standing fact like "near its 52-week
    # high" instead of it firing again on every single refresh regardless of
    # whether anything changed.
    fired_rules_at_last_view: Mapped[str | None] = mapped_column(String, nullable=True)

    watchlist: Mapped["Watchlist"] = relationship(back_populates="items")


class SeenEvent(Base):
    """One row per "mark as seen" action -- a real timeline of when the
    user looked at each symbol and what it was doing then. WatchlistItem
    only ever holds the LATEST seen snapshot (needed for the live "since
    last view" comparison); this is what lets Drift show an actual history
    of your own attention over time, not just the most recent baseline.
    Denormalized (symbol/company_name copied, not joined) so a symbol
    removed from the watchlist later doesn't erase its own history.
    """

    __tablename__ = "seen_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String)
    company_name: Mapped[str | None] = mapped_column(String, nullable=True)
    seen_at: Mapped[datetime.datetime] = mapped_column(DateTime(), default=utcnow, index=True)
    price_at_seen: Mapped[float | None] = mapped_column(Float, nullable=True)


class SymbolQuote(Base):
    """Shared cache: one row per symbol, fetched once and read by every user
    watching it. Never fetched per-request — see market_data/poller.
    """

    __tablename__ = "symbol_quotes"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    prev_close: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_volume_20d: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_daily_move_pct_20d: Mapped[float | None] = mapped_column(Float, nullable=True)
    week52_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    week52_low: Mapped[float | None] = mapped_column(Float, nullable=True)

    fetched_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(), nullable=True)
    fetch_ok: Mapped[bool] = mapped_column(default=True)  # false => last fetch failed, price is stale
    watch_count: Mapped[int] = mapped_column(Integer, default=0)  # ready for popularity-weighted polling
    spark_closes_json: Mapped[str | None] = mapped_column(String, nullable=True)  # last 30 closes, JSON
