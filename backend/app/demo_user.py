"""The one seeded demo account (see ENGINEERING_DECISIONS.md). Reached via
a no-password "try the demo" login (services/auth.py doesn't apply to it),
not real credentials -- it exists so a cold visitor sees the product
working immediately, not an empty signup wall.
"""

from sqlalchemy.orm import Session

from app.models import User, Watchlist

DEMO_USER_NAME = "demo"


def get_or_create_watchlist_for_user(db: Session, user: User) -> Watchlist:
    watchlist = db.query(Watchlist).filter_by(user_id=user.id).first()
    if watchlist is None:
        watchlist = Watchlist(user_id=user.id, name="My Watchlist")
        db.add(watchlist)
        db.flush()
    return watchlist


def get_or_create_demo_user(db: Session) -> User:
    user = db.query(User).filter_by(name=DEMO_USER_NAME).first()
    if user is None:
        user = User(name=DEMO_USER_NAME, password_hash=None)
        db.add(user)
        db.flush()
    return user
