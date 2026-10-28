from fastapi import APIRouter

from ..services import jobs as svc
from .deps import SessionDep, SettingsDep

router = APIRouter(prefix="/stats", tags=["estadístiques"])


@router.get("")
def get_stats(s: SessionDep, settings: SettingsDep, month: str | None = None):
    return svc.stats(s, month, settings)
