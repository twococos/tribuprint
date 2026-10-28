"""Controls de la impressora simulada (només amb PRINTER_BACKEND=mock)."""

from fastapi import APIRouter
from pydantic import BaseModel

from ..errors import ApiError
from ..printer.mock import CONDITIONS, MockPrinter
from .deps import HubDep

router = APIRouter(prefix="/mock", tags=["simulació"])


class ConditionIn(BaseModel):
    condition: str


def _mock(hub) -> MockPrinter:
    if not isinstance(hub.backend, MockPrinter):
        raise ApiError(404, "not_found", "Aquí no hi ha res.")
    return hub.backend


@router.get("")
def get_mock(hub: HubDep):
    m = _mock(hub)
    return {"condition": m.condition, "conditions": list(CONDITIONS), "levels": m.levels}


@router.post("/condition")
async def set_condition(data: ConditionIn, hub: HubDep):
    m = _mock(hub)
    if data.condition not in CONDITIONS:
        raise ApiError(400, "bad_condition", "Condició desconeguda.")
    m.set_condition(data.condition)
    await hub.refresh_printer()
    await hub.refresh_jobs()
    return {"condition": m.condition}
