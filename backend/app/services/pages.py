"""Rangs de pàgines tipus "1-3,5"."""

import re

_PART = re.compile(r"^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$")


class RangeError(ValueError):
    pass


def parse_ranges(spec: str, total: int) -> list[int]:
    """Retorna les pàgines (1-indexades, ordenades i sense repetir)."""
    pages: set[int] = set()
    for part in spec.split(","):
        if not part.strip():
            continue
        m = _PART.match(part)
        if not m:
            raise RangeError(f"No entenc «{part.strip()}»")
        a = int(m.group(1))
        b = int(m.group(2) or a)
        if a < 1 or b < a or b > total:
            raise RangeError(f"El rang «{part.strip()}» no encaixa amb {total} pàgines")
        pages.update(range(a, b + 1))
    if not pages:
        raise RangeError("Cap pàgina seleccionada")
    return sorted(pages)


def to_ranges(pages: list[int]) -> str:
    """[1,2,3,5] → "1-3,5"."""
    out: list[str] = []
    start = prev = None
    for p in sorted(set(pages)):
        if start is None:
            start = prev = p
        elif p == prev + 1:
            prev = p
        else:
            out.append(f"{start}-{prev}" if start != prev else str(start))
            start = prev = p
    if start is not None:
        out.append(f"{start}-{prev}" if start != prev else str(start))
    return ",".join(out)


def count_ranges(spec: str, total: int) -> int:
    return len(parse_ranges(spec, total))
