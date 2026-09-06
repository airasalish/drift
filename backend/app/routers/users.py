from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.auth import get_current_user
from app.services.change_detection import VALID_SENSITIVITIES

router = APIRouter(prefix="/api/users", tags=["users"])


class SettingsOut(BaseModel):
    sensitivity: str


class SettingsUpdate(BaseModel):
    sensitivity: str


@router.get("/me/settings", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user)):
    return SettingsOut(sensitivity=user.sensitivity)


@router.patch("/me/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.sensitivity not in VALID_SENSITIVITIES:
        raise HTTPException(
            400,
            f"sensitivity must be one of {sorted(VALID_SENSITIVITIES)}",
        )
    user.sensitivity = payload.sensitivity
    db.commit()
    db.refresh(user)
    return SettingsOut(sensitivity=user.sensitivity)
