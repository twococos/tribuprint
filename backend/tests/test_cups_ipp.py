"""Backend real sense impressora: simulem les respostes de pyipp i pycups.

Les dades són les que retorna ipp-usb de debò (ipptool al servidor, octubre 2026).
"""

import asyncio
import sys
import types

import pytest
from pyipp.enums import IppPrinterState, IppPrintQuality
from pyipp.exceptions import IPPConnectionError

from app.printer.base import SubmitOptions
from app.printer.cups_ipp import CupsIppPrinter, as_list, parse_markers

REAL_STATUS = {
    "printer-state": IppPrinterState.IDLE,
    "printer-state-reasons": "marker-supply-low-warning",
    "printer-alert-description": "Non-critical alert - marker ink almost empty",
    "printer-make-and-model": "Canon TS3300 series",
    "marker-names": ["Color", "Black"],
    "marker-colors": ["#00CFFF#F200FF#FFDA00", "#000000"],
    "marker-levels": [0, 10],
    "marker-low-levels": [15, 15],
    "marker-high-levels": [100, 100],
    "media-ready": "iso_a4_210x297mm",
}
REAL_CAPS = {
    "media-supported": [
        "iso_a5_148x210mm", "iso_a4_210x297mm", "jis_b5_182x257mm", "na_letter_8.5x11in",
        "na_legal_8.5x14in", "oe_photo-l_3.5x5in", "na_index-4x6_4x6in", "na_5x7_5x7in",
        "oe_square-photo_5x5in", "custom_min_89x127mm", "custom_max_215.9x676mm",
    ],
    "media-default": "iso_a4_210x297mm",
    "print-color-mode-supported": ["color", "monochrome", "auto", "auto-monochrome"],
    "print-quality-supported": [IppPrintQuality.NORMAL, IppPrintQuality.HIGH],
    "print-scaling-supported": ["none", "fill", "fit", "auto-fit", "auto"],
    "copies-supported": [1, 99],
    "sides-supported": "one-sided",
}


def make(monkeypatch, response=None, error=None):
    p = CupsIppPrinter("/run/cups/cups.sock", "Canon_TS3350", "ipp://localhost:60000/ipp/print", "coco")

    async def fake_execute(op, msg):
        if error:
            raise error
        wanted = msg["operation-attributes-tag"]["requested-attributes"]
        return {"printers": [{k: v for k, v in response.items() if k in wanted}]}

    monkeypatch.setattr(p._ipp, "execute", fake_execute)
    return p


def test_as_list():
    assert as_list(None) == []
    assert as_list("a") == ["a"]
    assert as_list(["a", "b"]) == ["a", "b"]


def test_markers_tricolor():
    m = parse_markers(REAL_STATUS)
    assert m[0].name == "Color" and m[0].colors == ["#00CFFF", "#F200FF", "#FFDA00"]
    assert (m[0].level, m[0].low, m[0].high) == (0, 15, 100)
    assert m[1].colors == ["#000000"] and m[1].level == 10


def test_marker_unknown_level():
    m = parse_markers({"marker-names": "Black", "marker-colors": "#000000", "marker-levels": -1})
    assert m[0].level is None


def test_status_from_ippusb(monkeypatch):
    s = asyncio.run(make(monkeypatch, REAL_STATUS).status())
    assert s.online and s.state == "idle"
    assert s.reasons == ["marker-supply-low-warning"]
    assert s.media_ready == ["iso_a4_210x297mm"]
    assert s.alert_description.startswith("Non-critical")


def test_offline_when_connection_refused(monkeypatch):
    s = asyncio.run(make(monkeypatch, error=IPPConnectionError("refused")).status())
    assert not s.online and s.state == "offline"


def test_capabilities(monkeypatch):
    c = asyncio.run(make(monkeypatch, REAL_CAPS).capabilities())
    assert "custom_min_89x127mm" not in c.media and len(c.media) == 9
    assert c.qualities == ["normal", "high"]
    assert c.copies_max == 99
    assert c.sides == ["one-sided"]


def test_submit_options_to_cups():
    o = SubmitOptions(copies=2, page_ranges="1-3,5", color_mode="monochrome", quality="high", orientation="landscape")
    assert o.to_cups() == {
        "copies": "2",
        "print-color-mode": "monochrome",
        "print-quality": "5",
        "media": "iso_a4_210x297mm",
        "print-scaling": "fit",
        "page-ranges": "1-3,5",
        "orientation-requested": "4",
    }
    assert "orientation-requested" not in SubmitOptions().to_cups()


@pytest.fixture
def fake_cups(monkeypatch):
    """Mòdul `cups` fals (pycups no s'instal·la fora de Linux)."""
    calls = []

    class IPPError(Exception):
        pass

    class Connection:
        def __init__(self, host=None):
            calls.append(("connect", host))

        def __getattr__(self, name):
            def f(*a, **kw):
                calls.append((name, a, kw))
                if name == "getJobs":
                    return {7: {"job-state": 5, "job-name": "Anna · x.pdf", "job-state-reasons": "job-printing",
                                "job-media-sheets-completed": 1}}
                if name == "getPrinterAttributes":
                    return {"printer-state": 5, "printer-is-accepting-jobs": True, "printer-state-message": "Pausada"}
                if name == "printFile":
                    return 42
            return f

    mod = types.SimpleNamespace(Connection=Connection, IPPError=IPPError, setUser=lambda u: calls.append(("user", u)))
    monkeypatch.setitem(sys.modules, "cups", mod)
    return calls


def test_cups_operations(monkeypatch, fake_cups):
    p = make(monkeypatch, REAL_STATUS)
    assert asyncio.run(p.submit("/data/x.pdf", "Anna · x.pdf", SubmitOptions())) == 42
    assert ("connect", "/run/cups/cups.sock") in fake_cups and ("user", "coco") in fake_cups
    jobs = asyncio.run(p.jobs())
    assert jobs[0].id == 7 and jobs[0].state == "processing" and jobs[0].sheets_completed == 1
    assert jobs[0].reasons == ["job-printing"]
    q = asyncio.run(p.queue_state())
    assert q.enabled is False and q.reason == "Pausada"
    asyncio.run(p.hold(7))
    asyncio.run(p.release(7))
    asyncio.run(p.pause())
    names = [(c[0], c[1]) for c in fake_cups if len(c) == 3]
    assert ("setJobHoldUntil", (7, "indefinite")) in names
    assert ("setJobHoldUntil", (7, "no-hold")) in names
    assert ("disablePrinter", ("Canon_TS3350",)) in names
