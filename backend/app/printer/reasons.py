"""Traducció de printer-state-reasons a missatges en català.

Per afegir-ne: posa una entrada a REASONS (clau sense sufix). Si el motiu
admet comodí (p. ex. output-area-*), afegeix-lo a PREFIXES.
"""

import logging
from dataclasses import dataclass

log = logging.getLogger(__name__)

SUFFIXES = ("-error", "-warning", "-report")

# missatge, severitat per defecte (si el motiu no porta sufix)
REASONS: dict[str, tuple[str, str]] = {
    "media-empty": ("Sense paper. Posa fulls a la safata posterior i prem OK a la impressora (E02).", "error"),
    "media-needed": ("Sense paper. Posa fulls a la safata posterior i prem OK a la impressora (E02).", "error"),
    "media-jam": ("Paper encallat. Obre la tapa i treu el full amb compte.", "error"),
    "marker-supply-low": ("Queda poca tinta de {cartutx}.", "warning"),
    "marker-supply-empty": ("Cartutx de {cartutx} buit.", "error"),
    "toner-low": ("Queda poca tinta de {cartutx}.", "warning"),
    "toner-empty": ("Cartutx de {cartutx} buit.", "error"),
    "cover-open": ("Tapa oberta.", "error"),
    "door-open": ("Tapa oberta.", "error"),
    "output-tray-missing": ("Obre la safata de sortida.", "error"),
    "spool-area-full": ("La cua del servidor és plena.", "info"),
    "offline": ("La impressora no respon.", "error"),
    "paused": ("Cua en pausa, els treballs esperen.", "info"),
    "moving-to-paused": ("Cua en pausa, els treballs esperen.", "info"),
}

PREFIXES: dict[str, tuple[str, str]] = {
    "output-area-": ("Obre la safata de sortida.", "error"),
}

# Motius que no cal ensenyar
IGNORED = {"none", "spool-area-full"}

OFFLINE_CODE = "printer-offline"
OFFLINE_MESSAGE = "Apagada o desconnectada."

SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2, "unknown": 3}


@dataclass
class Alert:
    code: str
    severity: str  # error | warning | info | unknown
    message: str


def split_suffix(reason: str) -> tuple[str, str | None]:
    for suf in SUFFIXES:
        if reason.endswith(suf):
            return reason[: -len(suf)], suf[1:]
    return reason, None


def _suffix_severity(suffix: str | None, default: str) -> str:
    return {"error": "error", "warning": "warning", "report": "info"}.get(suffix or "", default)


# Quan no sabem quin cartutx és
GENERIC = {
    "marker-supply-low": "Queda poca tinta.",
    "toner-low": "Queda poca tinta.",
    "marker-supply-empty": "Hi ha un cartutx buit.",
    "toner-empty": "Hi ha un cartutx buit.",
}


def cartridge_label(markers: list | None, empty: bool = False) -> str | None:
    """Quins cartutxos estan baixos (o buits). None si no es pot saber."""
    if not markers:
        return None
    if empty:
        hit = [m for m in markers if m.level == 0]
    else:
        hit = [m for m in markers if m.level is not None and m.low is not None and m.level <= m.low]
    if not hit:
        return None
    return " i ".join(_marker_name_ca(m.name) for m in hit)


def _marker_name_ca(name: str) -> str:
    return {"black": "negre", "color": "color", "colour": "color"}.get(name.lower(), name)


def translate(reasons: list[str], markers: list | None = None) -> list[Alert]:
    alerts: list[Alert] = []
    seen: set[str] = set()
    for reason in reasons:
        base, suffix = split_suffix(reason)
        if base in IGNORED and suffix != "error":
            # spool-area-full-report és normal amb ipp-usb; no molesta
            continue
        entry = REASONS.get(base)
        if entry is None:
            entry = next((v for p, v in PREFIXES.items() if base.startswith(p)), None)
        if entry is None:
            log.info("Motiu d'estat desconegut: %s", reason)
            alerts.append(Alert(code=reason, severity="unknown", message=reason))
            continue
        message, default = entry
        if "{cartutx}" in message:
            label = cartridge_label(markers, empty=base.endswith("empty"))
            message = message.format(cartutx=label) if label else GENERIC[base]
        if message in seen:
            continue
        seen.add(message)
        alerts.append(Alert(code=base, severity=_suffix_severity(suffix, default), message=message))
    alerts.sort(key=lambda a: SEVERITY_ORDER.get(a.severity, 9))
    return alerts


def offline_alert() -> Alert:
    return Alert(code=OFFLINE_CODE, severity="error", message=OFFLINE_MESSAGE)
