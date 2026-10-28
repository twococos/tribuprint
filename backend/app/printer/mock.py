"""Impressora simulada per desenvolupar i provar sense la Canon.

L'estat avança segons el temps real (SECONDS_PER_SHEET per full); no cal cap
tasca en segon pla. Les condicions (sense paper, apagada…) es provoquen amb
set_condition(), exposat a /api/mock.
"""

import asyncio
import itertools
import time
from dataclasses import dataclass, field
from pathlib import Path

from .base import (
    FINAL_JOB_STATES,
    Capabilities,
    CupsJob,
    Marker,
    PrinterBackend,
    PrinterError,
    PrinterStatus,
    QueueState,
    SubmitOptions,
)

CONDITIONS = {
    "ok": [],
    "no_paper": ["media-empty-error", "media-needed-error"],
    "jam": ["media-jam-error"],
    "cover_open": ["cover-open-error"],
    "low_ink": ["marker-supply-low-warning"],
    "empty_ink": ["marker-supply-empty-error"],
    "unknown": ["interpreter-resource-unavailable-warning"],
    "offline": [],
}
BLOCKING = {"no_paper", "jam", "cover_open", "empty_ink", "offline"}

MEDIA = [
    "iso_a4_210x297mm",
    "iso_a5_148x210mm",
    "jis_b5_182x257mm",
    "na_letter_8.5x11in",
    "na_legal_8.5x14in",
    "na_index-4x6_4x6in",
    "na_5x7_5x7in",
    "oe_photo-l_3.5x5in",
    "oe_square-photo_5x5in",
]


@dataclass
class _MockJob:
    id: int
    name: str
    sheets_total: int
    color: bool
    state: str = "pending"
    held: bool = False
    sheets_done: float = 0.0
    completed_at: float | None = None
    reasons: list[str] = field(default_factory=list)


class MockPrinter(PrinterBackend):
    SECONDS_PER_SHEET = 2.5

    def __init__(self) -> None:
        self.condition = "ok"
        self.enabled = True
        self.levels = {"Color": 62.0, "Black": 48.0}
        self._jobs: dict[int, _MockJob] = {}
        self._ids = itertools.count(101)
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    # --- simulació ---

    def set_condition(self, condition: str) -> None:
        if condition not in CONDITIONS:
            raise ValueError(condition)
        self._advance()
        self.condition = condition
        if condition == "low_ink":
            self.levels["Color"] = min(self.levels["Color"], 9)
        elif condition == "empty_ink":
            self.levels["Color"] = 0
        elif condition == "ok" and self.levels["Color"] < 20:
            self.levels = {"Color": 100.0, "Black": 100.0}  # cartutxos nous

    def _blocked(self) -> bool:
        return self.condition in BLOCKING or not self.enabled

    def _advance(self) -> None:
        now = time.monotonic()
        budget = (now - self._last) / self.SECONDS_PER_SHEET
        self._last = now
        for job in sorted(self._jobs.values(), key=lambda j: j.id):
            if job.state in FINAL_JOB_STATES or job.held:
                continue
            if self._blocked():
                if job.state == "processing" and self.condition in BLOCKING:
                    job.reasons = ["printer-stopped"]
                break
            job.state = "processing"
            job.reasons = ["job-printing"]
            if budget <= 0:
                break
            step = min(budget, job.sheets_total - job.sheets_done)
            job.sheets_done += step
            budget -= step
            key = "Color" if job.color else "Black"
            self.levels[key] = max(0.0, self.levels[key] - 0.4 * step)
            if job.sheets_done >= job.sheets_total - 1e-9:
                job.sheets_done = job.sheets_total
                job.state = "completed"
                job.reasons = ["job-completed-successfully"]
                job.completed_at = time.time()
            else:
                break

    def _to_cups(self, job: _MockJob) -> CupsJob:
        return CupsJob(
            id=job.id,
            state="held" if job.held and job.state == "pending" else job.state,
            name=job.name,
            reasons=list(job.reasons),
            impressions_completed=int(job.sheets_done),
            sheets_completed=int(job.sheets_done),
            completed_at=int(job.completed_at) if job.completed_at else None,
        )

    # --- interfície ---

    async def status(self) -> PrinterStatus:
        async with self._lock:
            self._advance()
            if self.condition == "offline":
                return PrinterStatus(online=False, state="offline")
            reasons = list(CONDITIONS[self.condition])
            markers = [
                Marker("Color", ["#00CFFF", "#F200FF", "#FFDA00"], round(self.levels["Color"]), 15, 100),
                Marker("Black", ["#000000"], round(self.levels["Black"]), 15, 100),
            ]
            if any(m.level <= 15 for m in markers) and "marker-supply-low-warning" not in reasons:
                if not any(m.level == 0 for m in markers):
                    reasons.append("marker-supply-low-warning")
            reasons.append("spool-area-full-report")  # ipp-usb l'envia sovint
            if self.condition in BLOCKING:
                state = "stopped"
            elif any(j.state == "processing" for j in self._jobs.values()):
                state = "processing"
            else:
                state = "idle"
            return PrinterStatus(
                online=True,
                state=state,
                reasons=reasons,
                markers=markers,
                media_ready=[] if self.condition == "no_paper" else ["iso_a4_210x297mm"],
                alert_description=None,
                make_and_model="Canon TS3300 series (simulada)",
            )

    async def capabilities(self) -> Capabilities:
        return Capabilities(
            media=list(MEDIA),
            media_default="iso_a4_210x297mm",
            color_modes=["color", "monochrome", "auto", "auto-monochrome"],
            qualities=["normal", "high"],
            scaling=["none", "fill", "fit", "auto-fit", "auto"],
            copies_max=99,
        )

    async def queue_state(self) -> QueueState:
        return QueueState(enabled=self.enabled, accepting=True, reason=None if self.enabled else "paused")

    async def submit(self, pdf_path: Path, title: str, options: SubmitOptions) -> int:
        if not Path(pdf_path).exists():
            raise PrinterError("El fitxer no existeix")
        from pypdf import PdfReader

        from ..services.pages import count_ranges

        total = len(PdfReader(pdf_path).pages)
        pages = count_ranges(options.page_ranges, total) if options.page_ranges else total
        async with self._lock:
            self._advance()
            job_id = next(self._ids)
            self._jobs[job_id] = _MockJob(
                id=job_id,
                name=title,
                sheets_total=max(1, pages) * options.copies,
                color=options.color_mode in ("color", "auto"),
            )
            return job_id

    async def jobs(self, which: str = "not-completed") -> list[CupsJob]:
        async with self._lock:
            self._advance()
            out = []
            for job in self._jobs.values():
                final = job.state in FINAL_JOB_STATES
                if (which == "completed") == final:
                    out.append(self._to_cups(job))
            return out

    async def job(self, job_id: int) -> CupsJob | None:
        async with self._lock:
            self._advance()
            job = self._jobs.get(job_id)
            return self._to_cups(job) if job else None

    def _get(self, job_id: int) -> _MockJob:
        job = self._jobs.get(job_id)
        if job is None:
            raise PrinterError(f"No existeix el treball {job_id}")
        return job

    async def cancel(self, job_id: int) -> None:
        async with self._lock:
            self._advance()
            job = self._get(job_id)
            if job.state not in FINAL_JOB_STATES:
                job.state = "canceled"
                job.reasons = ["job-canceled-by-user"]
                job.completed_at = time.time()

    async def hold(self, job_id: int) -> None:
        async with self._lock:
            self._advance()
            job = self._get(job_id)
            if job.state != "pending":
                raise PrinterError("Només es poden retenir treballs pendents")
            job.held = True
            job.reasons = ["job-hold-until-specified"]

    async def release(self, job_id: int) -> None:
        async with self._lock:
            self._advance()
            job = self._get(job_id)
            job.held = False
            job.reasons = []

    async def pause(self) -> None:
        async with self._lock:
            self._advance()
            self.enabled = False

    async def resume(self) -> None:
        async with self._lock:
            self._advance()
            self.enabled = True
