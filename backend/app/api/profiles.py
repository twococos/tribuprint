from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlmodel import col, select

from ..errors import ApiError
from ..models import Profile, utcnow
from ..services.jobs import profile_dict
from .deps import SessionDep

router = APIRouter(prefix="/profiles", tags=["perfils"])

HEX = r"^#[0-9A-Fa-f]{6}$"


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    emoji: str = Field(min_length=1, max_length=16)
    color: str = Field(pattern=HEX)


class ProfilePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=24)
    emoji: str | None = Field(None, min_length=1, max_length=16)
    color: str | None = Field(None, pattern=HEX)


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ApiError(400, "bad_name", "Cal un nom.")
    return name


def _check_unique(s, name: str, exclude: int | None = None) -> None:
    q = select(Profile).where(Profile.deleted_at.is_(None))
    for p in s.exec(q).all():
        if p.id != exclude and p.name.casefold() == name.casefold():
            raise ApiError(409, "name_taken", f"Ja hi ha algú que es diu {name}.")


@router.get("")
def list_profiles(s: SessionDep):
    rows = s.exec(select(Profile).where(Profile.deleted_at.is_(None)).order_by(col(Profile.id))).all()
    return [profile_dict(p) for p in rows]


@router.post("", status_code=201)
def create_profile(data: ProfileIn, s: SessionDep):
    name = _clean_name(data.name)
    _check_unique(s, name)
    p = Profile(name=name, emoji=data.emoji, color=data.color.upper())
    s.add(p)
    s.commit()
    s.refresh(p)
    return profile_dict(p)


def _get(s, profile_id: int) -> Profile:
    p = s.get(Profile, profile_id)
    if p is None or p.deleted_at is not None:
        raise ApiError(404, "not_found", "Aquest perfil no existeix.")
    return p


@router.patch("/{profile_id}")
def update_profile(profile_id: int, data: ProfilePatch, s: SessionDep):
    p = _get(s, profile_id)
    if data.name is not None:
        name = _clean_name(data.name)
        _check_unique(s, name, exclude=p.id)
        p.name = name
    if data.emoji is not None:
        p.emoji = data.emoji
    if data.color is not None:
        p.color = data.color.upper()
    s.add(p)
    s.commit()
    s.refresh(p)
    return profile_dict(p)


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, s: SessionDep):
    # Esborrat tou: l'historial continua apuntant-hi ("Perfil eliminat")
    p = _get(s, profile_id)
    p.deleted_at = utcnow()
    s.add(p)
    s.commit()
