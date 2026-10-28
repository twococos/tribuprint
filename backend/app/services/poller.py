"""Bucle en segon pla: consulta la impressora i CUPS, desa a memòria cau i emet SSE.

Tots els clients llegeixen la mateixa memòria cau; així l'USB només rep
una consulta cada pocs segons, hi hagi els navegadors que hi hagi.
"""

import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from ..config import Settings
from ..db import get_engine
from ..models import DuplexBatch, Job, utcnow
from ..printer.base import FINAL_JOB_STATES, PrinterBackend, PrinterError, to_dict
from ..printer.reasons import offline_alert, translate
from . import jobs as jobs_service

log = logging.getLogger(__name__)

IPP_IDLE_EVERY = 5.0
IPP_BUSY_EVERY = 2.0
CUPS_EVERY = 2.0
CAPS_EVERY = 600.0


class Hub:
    def __init__(self, backend: PrinterBackend, settings: Settings) -> None:
        self.backend = backend
        self.settings = settings
        self.printer: dict[str, Any] | None = None
        self.jobs: dict[str, Any] | None = None
        self._caps: dict[str, Any] | None = None
        self._caps_at = 0.0
        self._subs: set[asyncio.Queue] = set()
        self._printer_lock = asyncio.Lock()
        self._jobs_lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

    # --- subscripcions SSE ---

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def publish(self, event: str, data: Any) -> None:
        for q in list(self._subs):
            try:
                q.put_nowait((event, data))
            except asyncio.QueueFull:
                pass  # client encallat: ja es posarà al dia amb el refetch

    # --- impressora ---

    async def capabilities(self) -> dict[str, Any]:
        if self._caps is None or time.monotonic() - self._caps_at > CAPS_EVERY:
            self._caps = to_dict(await self.backend.capabilities())
            self._caps_at = time.monotonic()
        return self._caps

    async def refresh_printer(self) -> dict[str, Any]:
        async with self._printer_lock:
            status = await self.backend.status()
            try:
                queue = to_dict(await self.backend.queue_state())
                cups_ok = True
            except PrinterError as exc:
                log.warning("No puc llegir la cua de CUPS: %s", exc)
                queue, cups_ok = None, False
            if status.online:
                alerts = [to_dict(a) for a in translate(status.reasons, status.markers)]
            else:
                alerts = [to_dict(offline_alert())]
            if not cups_ok:
                alerts.insert(0, {"code": "cups-unreachable", "severity": "error", "message": "No puc parlar amb CUPS."})
            snapshot = {
                "online": status.online,
                "state": status.state,
                "reasons": status.reasons,
                "alerts": alerts,
                "alert_description": status.alert_description,
                "markers": [to_dict(m) for m in status.markers],
                "media_ready": status.media_ready,
                "make_and_model": status.make_and_model,
                "queue": queue,
                "capabilities": await self.capabilities(),
                "cups_web_url": self.settings.cups_web_url,
                "backend": self.settings.printer_backend,
            }
            if snapshot != self.printer:
                self.printer = snapshot
                self.publish("printer", snapshot)
            return snapshot

    # --- treballs ---

    async def refresh_jobs(self) -> bool:
        """Sincronitza la BD amb CUPS. Retorna True si ha canviat res."""
        async with self._jobs_lock:
            changed = False
            with Session(get_engine()) as s:
                active = s.exec(
                    select(Job).where(Job.cups_job_id.is_not(None)).where(Job.state.not_in(FINAL_JOB_STATES))
                ).all()
                if active:
                    try:
                        live = {j.id: j for j in await self.backend.jobs("not-completed")}
                    except PrinterError as exc:
                        log.warning("No puc llegir els treballs de CUPS: %s", exc)
                        return False
                    for job in active:
                        cj = live.get(job.cups_job_id) or await self.backend.job(job.cups_job_id)
                        if await self._apply(s, job, cj):
                            changed = True
                    s.commit()
                payload = jobs_service.queue_payload(s, self.settings)
            if changed or payload != self.jobs:
                self.jobs = payload
                self.publish("jobs", payload)
                changed = True
            return changed

    async def _apply(self, s: Session, job: Job, cj) -> bool:
        if cj is None:
            # CUPS ja l'ha oblidat (historial purgat): el donem per acabat
            new_state, reason, sheets, done_at = "completed", None, job.sheets_completed, None
        else:
            new_state = cj.state
            reason = cj.reasons[0] if cj.reasons else None
            sheets = cj.sheets_completed if cj.sheets_completed is not None else cj.impressions_completed
            done_at = cj.completed_at
        if (new_state, reason, sheets) == (job.state, job.state_reason, job.sheets_completed):
            return False
        job.state, job.state_reason, job.sheets_completed = new_state, reason, sheets
        if new_state in FINAL_JOB_STATES:
            job.completed_at = (
                datetime.fromtimestamp(done_at, UTC) if done_at else utcnow()
            )
            self._on_final(s, job)
        s.add(job)
        return True

    def _on_final(self, s: Session, job: Job) -> None:
        self.publish(
            "job_done",
            {"id": job.id, "state": job.state, "filename": job.filename, "profile_id": job.profile_id},
        )
        if not job.duplex_batch_id:
            return
        batch = s.get(DuplexBatch, job.duplex_batch_id)
        if batch is None:
            return
        if job.duplex_stage == 1:
            if job.state == "completed":
                batch.status = "waiting_flip"
                self.publish("duplex", {"batch_id": batch.id, "status": batch.status, "job_id": job.id})
            else:
                batch.status = "canceled"
        elif job.duplex_stage == 2:
            batch.status = "done" if job.state == "completed" else "canceled"
        s.add(batch)

    # --- bucle ---

    async def run(self) -> None:
        last_ipp = last_cups = 0.0
        while True:
            now = time.monotonic()
            busy = bool(self.jobs and self.jobs.get("active"))
            try:
                if now - last_cups >= CUPS_EVERY:
                    last_cups = now
                    await self.refresh_jobs()
                if now - last_ipp >= (IPP_BUSY_EVERY if busy else IPP_IDLE_EVERY):
                    last_ipp = now
                    await self.refresh_printer()
            except Exception:  # noqa: BLE001  el bucle no es pot morir
                log.exception("Error al bucle de consulta")
            await asyncio.sleep(0.5)

    def start(self) -> None:
        self._task = asyncio.create_task(self.run(), name="poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


def sse_format(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
