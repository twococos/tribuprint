from fastapi import APIRouter

from ..errors import ApiError
from ..printer.base import PrinterError
from .deps import HubDep

router = APIRouter(prefix="/printer", tags=["impressora"])


@router.get("")
async def get_printer(hub: HubDep):
    return hub.printer or await hub.refresh_printer()


async def _queue_action(hub, action: str):
    try:
        await getattr(hub.backend, action)()
    except PrinterError as exc:
        raise ApiError(502, "printer_error", "CUPS no m'ha deixat fer-ho.", detail=str(exc)) from exc
    snapshot = await hub.refresh_printer()
    await hub.refresh_jobs()
    return snapshot


@router.post("/pause")
async def pause(hub: HubDep):
    return await _queue_action(hub, "pause")


@router.post("/resume")
async def resume(hub: HubDep):
    return await _queue_action(hub, "resume")
