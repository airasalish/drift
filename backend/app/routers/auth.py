from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_user import get_or_create_demo_user
from app.models import User
from app.services.auth import create_session, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str
    password: str


def _bad_username(username: str) -> bool:
    u = username.strip()
    return len(u) < 2 or len(u) > 40


@router.post("/signup")
def signup(payload: Credentials, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if _bad_username(username):
        raise HTTPException(400, "username must be 2-40 characters")
    if len(payload.password) < 6:
        raise HTTPException(400, "password must be at least 6 characters")

    existing = db.query(User).filter_by(name=username).first()
    if existing is not None:
        raise HTTPException(409, "that username is already taken")

    user = User(name=username, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user)
    return {"token": token, "username": user.name}


@router.post("/login")
def login(payload: Credentials, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(name=payload.username.strip()).first()
    if user is None or user.password_hash is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "wrong username or password")

    token = create_session(db, user)
    return {"token": token, "username": user.name}


@router.post("/demo")
def login_as_demo(db: Session = Depends(get_db)):
    """No password -- this is the fixed seeded account, reached
    deliberately without credentials so a cold visitor sees the product
    working immediately. See ENGINEERING_DECISIONS.md.
    """
    user = get_or_create_demo_user(db)
    db.commit()
    token = create_session(db, user)
    return {"token": token, "username": user.name}
