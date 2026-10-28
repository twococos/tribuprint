"""Interfície comuna dels backends d'impressora (real i mock)."""

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Codis d'estat de treball IPP → nom intern
JOB_STATES = {
    3: "pending",
    4: "held",
    5: "processing",
    6: "stopped",
    7: "canceled",
    8: "aborted",
    9: "completed",
}
FINAL_JOB_STATES = {"canceled", "aborted", "completed"}

PRINTER_STATES = {3: "idle", 4: "processing", 5: "stopped"}


@dataclass
class Marker:
    name: str
    colors: list[str]
    level: int | None
    low: int | None = None
    high: int | None = None


@dataclass
class Capabilities:
    media: list[str] = field(default_factory=list)
    media_default: str = "iso_a4_210x297mm"
    color_modes: list[str] = field(default_factory=list)
    qualities: list[str] = field(default_factory=list)
    scaling: list[str] = field(default_factory=list)
    copies_max: int = 99
    sides: list[str] = field(default_factory=lambda: ["one-sided"])


@dataclass
class PrinterStatus:
    """Estat en viu, llegit directament de la impressora (ipp-usb)."""

    online: bool
    state: str  # idle | processing | stopped | offline
    reasons: list[str] = field(default_factory=list)
    markers: list[Marker] = field(default_factory=list)
    media_ready: list[str] = field(default_factory=list)
    alert_description: str | None = None
    make_and_model: str | None = None


@dataclass
class QueueState:
    enabled: bool
    accepting: bool
    reason: str | None = None


@dataclass
class CupsJob:
    id: int
    state: str
    name: str = ""
    reasons: list[str] = field(default_factory=list)
    impressions_completed: int | None = None
    sheets_completed: int | None = None
    completed_at: int | None = None  # epoch (time-at-completed)


@dataclass
class SubmitOptions:
    copies: int = 1
    page_ranges: str | None = None
    color_mode: str = "color"
    quality: str = "normal"
    media: str = "iso_a4_210x297mm"
    scaling: str = "fit"
    orientation: str = "auto"  # auto | portrait | landscape

    def to_cups(self) -> dict[str, str]:
        """Opcions per a printFile (CUPS les codifica a IPP)."""
        opts = {
            "copies": str(self.copies),
            "print-color-mode": self.color_mode,
            # print-quality és un enum: 3 esborrany, 4 normal, 5 alta
            "print-quality": {"draft": "3", "normal": "4", "high": "5"}.get(self.quality, "4"),
            "media": self.media,
            "print-scaling": self.scaling,
        }
        if self.page_ranges:
            opts["page-ranges"] = self.page_ranges
        if self.orientation == "portrait":
            opts["orientation-requested"] = "3"
        elif self.orientation == "landscape":
            opts["orientation-requested"] = "4"
        return opts


def to_dict(obj: Any) -> dict[str, Any]:
    return asdict(obj)


class PrinterError(Exception):
    """Error de comunicació amb CUPS o la impressora."""


class PrinterBackend(ABC):
    @abstractmethod
    async def status(self) -> PrinterStatus: ...

    @abstractmethod
    async def capabilities(self) -> Capabilities: ...

    @abstractmethod
    async def queue_state(self) -> QueueState: ...

    @abstractmethod
    async def submit(self, pdf_path: Path, title: str, options: SubmitOptions) -> int: ...

    @abstractmethod
    async def jobs(self, which: str = "not-completed") -> list[CupsJob]:
        """which: 'not-completed' | 'completed'."""

    @abstractmethod
    async def job(self, job_id: int) -> CupsJob | None: ...

    @abstractmethod
    async def cancel(self, job_id: int) -> None: ...

    @abstractmethod
    async def hold(self, job_id: int) -> None: ...

    @abstractmethod
    async def release(self, job_id: int) -> None: ...

    @abstractmethod
    async def pause(self) -> None: ...

    @abstractmethod
    async def resume(self) -> None: ...

    async def close(self) -> None:
        return None
