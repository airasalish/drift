"""Single hardcoded demo account (see ENGINEERING_DECISIONS.md). Every table
still keys off a real user_id/watchlist_id — this just always resolves to
the same one, so swapping in real auth later means changing this function's
body, not the schema.
"""

from sqlalchemy.orm import Session

from app.models import User, Watchlist

DEMO_USER_NAME = "demo"


def get_or_create_demo_watchlist(db: Session) -> Watchlist:
    user = db.query(User).filter_by(name=DEMO_USER_NAME).first()
    if user is None:
        user = User(name=DEMO_USER_NAME)
        db.add(user)
        db.flush()

    watchlist = db.query(Watchlist).filter_by(user_id=user.id).first()
    if watchlist is None:
        watchlist = Watchlist(user_id=user.id, name="My Watchlist")
        db.add(watchlist)
        db.flush()

    return watchlist
