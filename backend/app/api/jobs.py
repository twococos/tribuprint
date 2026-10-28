from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from ..errors import ApiError
from ..models import Job
from ..printer.base import FINAL_JOB_STATES, PrinterError
from ..services import jobs as svc
from .deps import HubDep, SessionDep, SettingsDep

router = APIRouter(prefix="/jobs", tags=["treballs"])


class ReprintIn(BaseModel):
    profile_id: int | None = None


@router.get("")
def list_jobs(
    s: SessionDep,
    settings: SettingsDep,
    scope: Literal["active", "today", "history"] = "active",
    profile: int | None = None,
    page: int = 1,
):
    if scope == "history":
        return svc.history(s, profile, page)
    payload = svc.queue_payload(s, settings)
    if scope == "today":
        return {"items": payload["today"]}
    return {"items": payload["active"], "duplex_waiting": payload["duplex_waiting"]}


@router.post("", status_code=201)
async def create_job(data: svc.JobCreate, s: SessionDep, hub: HubDep):
    caps = await hub.capabilities()
    jobs = await svc.create_job(s, hub.backend, caps, data)
    out = [svc.job_dict(s, j) for j in jobs]
    await hub.refresh_jobs()
    return {"items": out}


def _job(s, job_id: int) -> Job:
    job = s.get(Job, job_id)
    if job is None:
        raise ApiError(404, "not_found", "Aquest treball no existeix.")
    return job


async def _action(s, hub, job_id: int, action: str, verb: str):
    job = _job(s, job_id)
    if job.state in FINAL_JOB_STATES or job.cups_job_id is None:
        raise ApiError(409, "job_finished", "Aquest treball ja s'ha acabat.")
    try:
        await getattr(hub.backend, action)(job.cups_job_id)
    except PrinterError as exc:
        raise ApiError(409, "printer_error", f"No l'he pogut {verb}.", detail=str(exc)) from exc
    await hub.refresh_jobs()
    s.refresh(job)
    return svc.job_dict(s, job)


@router.post("/{job_id}/cancel")
async def cancel(job_id: int, s: SessionDep, hub: HubDep):
    return await _action(s, hub, job_id, "cancel", "cancel·lar")


@router.post("/{job_id}/hold")
async def hold(job_id: int, s: SessionDep, hub: HubDep):
    return await _action(s, hub, job_id, "hold", "retenir")


@router.post("/{job_id}/release")
async def release(job_id: int, s: SessionDep, hub: HubDep):
    return await _action(s, hub, job_id, "release", "alliberar")


@router.post("/{job_id}/reprint", status_code=201)
async def reprint(job_id: int, s: SessionDep, hub: HubDep, data: ReprintIn | None = None):
    caps = await hub.capabilities()
    jobs = await svc.reprint(s, hub.backend, caps, job_id, data.profile_id if data else None)
    out = [svc.job_dict(s, j) for j in jobs]
    await hub.refresh_jobs()
    return {"items": out}
