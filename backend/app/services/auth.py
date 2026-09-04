"""Real signup/login, additive on top of the single-demo-account design
from day one -- see ENGINEERING_DECISIONS.md's very first entry. user_id
was modeled as a first-class column everywhere from the start specifically
so this could be a follow-on, not a rearchitecture.

Deliberately simple: bcrypt for password hashing (industry-standard, no
reason to roll anything custom), and an opaque random token in a DB table
for sessions rather than JWT -- no signing-key management, trivially
revocable by deleting a row, at the cost of one DB lookup per request.
That cost is negligible next to the yfinance/Groq calls elsewhere in this
app, so it's not a real tradeoff worth avoiding.
"""

import secrets

import bcrypt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import Session, User

DEMO_USER_NAME = "demo"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_session(db: DBSession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(Session(token=token, user_id=user.id))
    db.commit()
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    token: str | None = None,
    db: DBSession = Depends(get_db),
) -> User:
    # normally a Bearer header; `token` query param is a deliberate second
    # path only for navigator.sendBeacon calls (auto-mark-seen-on-leave),
    # which cannot attach custom headers at all -- see api.ts markSeenBeacon
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "not logged in")

    session = db.get(Session, token)
    if session is None:
        raise HTTPException(401, "session expired or invalid, please log in again")

    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "session expired or invalid, please log in again")

    return user
