"""Backend real: CUPS pel socket Unix (pycups) + estat en viu d'ipp-usb (pyipp).

- Accions (enviar, cancel·lar, pausar…) → CUPS. Pel socket local CUPS ens
  identifica per l'uid (PeerCred); amb uid 1000 = coco ∈ lpadmin, no cal contrasenya.
- Estat en viu (tinta, alertes) → ipp-usb a localhost:60000, perquè els markers
  de la cua de CUPS només s'actualitzen mentre imprimeix.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any

from pyipp import IPP
from pyipp.enums import IppOperation
from pyipp.exceptions import IPPConnectionError, IPPError

from .base import (
    JOB_STATES,
    PRINTER_STATES,
    Capabilities,
    CupsJob,
    Marker,
    PrinterBackend,
    PrinterError,
    PrinterStatus,
    QueueState,
    SubmitOptions,
)

log = logging.getLogger(__name__)

STATUS_ATTRS = [
    "printer-state",
    "printer-state-reasons",
    "printer-alert-description",
    "printer-make-and-model",
    "marker-names",
    "marker-colors",
    "marker-levels",
    "marker-low-levels",
    "marker-high-levels",
    "media-ready",
]
CAPS_ATTRS = [
    "media-supported",
    "media-default",
    "print-color-mode-supported",
    "print-quality-supported",
    "print-scaling-supported",
    "copies-supported",
    "sides-supported",
]
JOB_ATTRS = [
    "job-id",
    "job-state",
    "job-state-reasons",
    "job-name",
    "job-impressions-completed",
    "job-media-sheets-completed",
    "time-at-completed",
]
QUALITY_NAMES = {3: "draft", 4: "normal", 5: "high"}


def as_list(value: Any) -> list:
    """pyipp/pycups tornen un escalar si només hi ha un valor."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def parse_markers(attrs: dict[str, Any]) -> list[Marker]:
    names = as_list(attrs.get("marker-names"))
    colors = as_list(attrs.get("marker-colors"))
    levels = as_list(attrs.get("marker-levels"))
    lows = as_list(attrs.get("marker-low-levels"))
    highs = as_list(attrs.get("marker-high-levels"))
    out = []
    for i, name in enumerate(names):
        raw = colors[i] if i < len(colors) else ""
        # "#00CFFF#F200FF#FFDA00" → tres colors (cartutx tricolor)
        cols = ["#" + c for c in str(raw).split("#") if c]
        level = levels[i] if i < len(levels) else None
        # -1/-2/-3 = desconegut segons RFC 3805
        out.append(
            Marker(
                name=str(name),
                colors=cols,
                level=int(level) if level is not None and int(level) >= 0 else None,
                low=int(lows[i]) if i < len(lows) else None,
                high=int(highs[i]) if i < len(highs) else None,
            )
        )
    return out


def _job_from_attrs(job_id: int, a: dict[str, Any]) -> CupsJob:
    def opt_int(key: str) -> int | None:
        v = a.get(key)
        return int(v) if isinstance(v, int) else None

    return CupsJob(
        id=int(job_id),
        state=JOB_STATES.get(int(a.get("job-state", 3)), "pending"),
        name=str(a.get("job-name", "")),
        reasons=[str(r) for r in as_list(a.get("job-state-reasons")) if r != "none"],
        impressions_completed=opt_int("job-impressions-completed"),
        sheets_completed=opt_int("job-media-sheets-completed"),
        completed_at=opt_int("time-at-completed"),
    )


class CupsIppPrinter(PrinterBackend):
    def __init__(self, cups_server: str, printer: str, ippusb_url: str, user: str) -> None:
        self.cups_server = cups_server
        self.printer = printer
        self.user = user
        self._ipp = IPP(host=ippusb_url, request_timeout=4)
        # pycups no és fil-segur: una operació alhora
        self._cups_lock = asyncio.Lock()
        self._caps: Capabilities | None = None

    # --- CUPS (bloquejant → fil) ---

    def _conn(self):
        import cups

        cups.setUser(self.user)
        # Un host que comença per "/" és un socket Unix per a libcups
        return cups.Connection(host=self.cups_server)

    async def _cups(self, fn_name: str, *args, **kwargs):
        def run():
            import cups

            try:
                conn = self._conn()
                return getattr(conn, fn_name)(*args, **kwargs)
            except cups.IPPError as exc:
                status, msg = exc.args if len(exc.args) == 2 else (None, str(exc))
                raise PrinterError(f"CUPS ({status}): {msg}") from exc
            except RuntimeError as exc:  # p. ex. no es pot connectar al socket
                raise PrinterError(f"CUPS: {exc}") from exc

        async with self._cups_lock:
            return await asyncio.to_thread(run)

    # --- ipp-usb ---

    async def _ipp_attrs(self, attrs: list[str]) -> dict[str, Any]:
        resp = await self._ipp.execute(
            IppOperation.GET_PRINTER_ATTRIBUTES,
            {"operation-attributes-tag": {"requested-attributes": attrs}},
        )
        return next(iter(resp.get("printers") or []), {})

    async def status(self) -> PrinterStatus:
        try:
            a = await self._ipp_attrs(STATUS_ATTRS)
        except IPPConnectionError:
            # Impressora apagada: el dispositiu USB desapareix i ipp-usb no escolta
            return PrinterStatus(online=False, state="offline")
        except IPPError as exc:
            log.warning("ipp-usb ha respost amb error: %s", exc)
            return PrinterStatus(online=False, state="offline")
        state = PRINTER_STATES.get(int(a.get("printer-state", 3)), "idle")
        alert = a.get("printer-alert-description")
        return PrinterStatus(
            online=True,
            state=state,
            reasons=[str(r) for r in as_list(a.get("printer-state-reasons")) if r != "none"],
            markers=parse_markers(a),
            media_ready=[str(m) for m in as_list(a.get("media-ready"))],
            alert_description=str(alert) if alert else None,
            make_and_model=a.get("printer-make-and-model"),
        )

    async def capabilities(self) -> Capabilities:
        try:
            a = await self._ipp_attrs(CAPS_ATTRS)
        except IPPError:
            if self._caps:
                return self._caps
            # Apagada i encara no l'hem vista mai: valors coneguts de la TS3350
            from .mock import MockPrinter

            return await MockPrinter().capabilities()
        copies = as_list(a.get("copies-supported"))
        caps = Capabilities(
            media=[m for m in map(str, as_list(a.get("media-supported"))) if not m.startswith("custom_")],
            media_default=str(a.get("media-default") or "iso_a4_210x297mm"),
            color_modes=[str(c) for c in as_list(a.get("print-color-mode-supported"))],
            qualities=[QUALITY_NAMES.get(int(q), str(q)) for q in as_list(a.get("print-quality-supported"))],
            scaling=[str(s) for s in as_list(a.get("print-scaling-supported"))],
            copies_max=int(copies[-1]) if copies else 99,
            sides=[str(s) for s in as_list(a.get("sides-supported"))] or ["one-sided"],
        )
        self._caps = caps
        return caps

    async def queue_state(self) -> QueueState:
        a = await self._cups(
            "getPrinterAttributes",
            self.printer,
            requested_attributes=["printer-state", "printer-is-accepting-jobs", "printer-state-message"],
        )
        # A CUPS, una cua "disabled" té printer-state = stopped (5)
        enabled = int(a.get("printer-state", 3)) != 5
        return QueueState(
            enabled=enabled,
            accepting=bool(a.get("printer-is-accepting-jobs", True)),
            reason=a.get("printer-state-message") or None,
        )

    async def submit(self, pdf_path: Path, title: str, options: SubmitOptions) -> int:
        return int(await self._cups("printFile", self.printer, str(pdf_path), title, options.to_cups()))

    async def jobs(self, which: str = "not-completed") -> list[CupsJob]:
        raw = await self._cups(
            "getJobs",
            which_jobs=which,
            my_jobs=False,
            requested_attributes=JOB_ATTRS,
        )
        return [_job_from_attrs(jid, a) for jid, a in raw.items()]

    async def job(self, job_id: int) -> CupsJob | None:
        try:
            a = await self._cups("getJobAttributes", job_id, requested_attributes=JOB_ATTRS)
        except PrinterError:
            return None
        return _job_from_attrs(job_id, a)

    async def cancel(self, job_id: int) -> None:
        await self._cups("cancelJob", job_id)

    async def hold(self, job_id: int) -> None:
        await self._cups("setJobHoldUntil", job_id, "indefinite")

    async def release(self, job_id: int) -> None:
        await self._cups("setJobHoldUntil", job_id, "no-hold")

    async def pause(self) -> None:
        await self._cups("disablePrinter", self.printer, reason="Pausada des de TribuPrint")

    async def resume(self) -> None:
        await self._cups("enablePrinter", self.printer)

    async def close(self) -> None:
        await self._ipp.close()
