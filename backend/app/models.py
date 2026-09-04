import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
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

    watchlists: Mapped[list["Watchlist"]] = relationship(back_populates="user")


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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id"))
    symbol: Mapped[str] = mapped_column(String, index=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)  # user's "why I added this"
    added_at: Mapped[datetime.datetime] = mapped_column(DateTime(), default=utcnow)
    added_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    last_viewed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), nullable=True
    )
    price_at_last_view: Mapped[float | None] = mapped_column(Float, nullable=True)

    watchlist: Mapped["Watchlist"] = relationship(back_populates="items")


class SymbolQuote(Base):
    """Shared cache: one row per symbol, fetched once and read by every user
    watching it. Never fetched per-request — see market_data/poller.
    """

    __tablename__ = "symbol_quotes"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
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
