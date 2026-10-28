"""Dúplex manual: primer les senars, després les parells al revés.

Amb un total senar s'afegeix una pàgina en blanc al principi de la tanda de
parells (que és la que es correspon amb l'últim full), perquè els fulls quadrin.
"""

from pathlib import Path

from pypdf import PdfReader, PdfWriter


def split_pages(selected: list[int]) -> tuple[list[int], list[int | None]]:
    """Retorna (cara A, cara B). None vol dir pàgina en blanc.

    `selected` són les pàgines ja triades, en ordre. La cara B va invertida.
    """
    odd = selected[0::2]
    even: list[int | None] = list(selected[1::2])
    if len(selected) % 2:
        even.append(None)
    even.reverse()
    return odd, even


def write_duplex(src: Path, selected: list[int], odd_out: Path, even_out: Path) -> tuple[int, int]:
    """Escriu els dos PDF. Retorna el nombre de pàgines de cadascun."""
    reader = PdfReader(src)
    odd, even = split_pages(selected)

    w_odd = PdfWriter()
    for p in odd:
        w_odd.add_page(reader.pages[p - 1])
    with open(odd_out, "wb") as f:
        w_odd.write(f)

    w_even = PdfWriter()
    for p in even:
        if p is None:
            ref = reader.pages[selected[-1] - 1]
            w_even.add_blank_page(width=ref.mediabox.width, height=ref.mediabox.height)
        else:
            w_even.add_page(reader.pages[p - 1])
    with open(even_out, "wb") as f:
        w_even.write(f)
    return len(odd), len(even)
