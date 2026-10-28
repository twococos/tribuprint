from fastapi import APIRouter

from ..services import jobs as svc
from .deps import HubDep, SessionDep

router = APIRouter(prefix="/duplex", tags=["doble cara"])


@router.post("/{batch_id}/continue", status_code=201)
async def continue_batch(batch_id: int, s: SessionDep, hub: HubDep):
    job = await svc.duplex_continue(s, hub.backend, batch_id)
    out = svc.job_dict(s, job)
    await hub.refresh_jobs()
    return out


@router.post("/{batch_id}/cancel")
async def cancel_batch(batch_id: int, s: SessionDep, hub: HubDep):
    batch = svc.duplex_cancel(s, batch_id)
    out = svc.duplex_dict(s, batch)
    await hub.refresh_jobs()
    return out
