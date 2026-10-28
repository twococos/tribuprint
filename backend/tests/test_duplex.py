import pytest
from pypdf import PdfReader, PdfWriter

from app.services.duplex import split_pages, write_duplex
from app.services.pages import RangeError, parse_ranges, to_ranges


@pytest.mark.parametrize(
    ("n", "odd", "even"),
    [
        (1, [1], [None]),
        (2, [1], [2]),
        (5, [1, 3, 5], [None, 4, 2]),
        (6, [1, 3, 5], [6, 4, 2]),
    ],
)
def test_split_pages(n, odd, even):
    assert split_pages(list(range(1, n + 1))) == (odd, even)


def test_split_respects_selection():
    # Pàgines triades 2,3,7 → A: 2,7 ; B: blanc, 3
    assert split_pages([2, 3, 7]) == ([2, 7], [None, 3])


def _numbered_pdf(path, n):
    """PDF on cada pàgina té una amplada diferent: així sabem quina és."""
    w = PdfWriter()
    for i in range(1, n + 1):
        w.add_blank_page(width=100 + i, height=800)
    w.write(path)


@pytest.mark.parametrize("n", [1, 2, 5, 6])
def test_write_duplex(tmp_path, n):
    src, a, b = tmp_path / "src.pdf", tmp_path / "a.pdf", tmp_path / "b.pdf"
    _numbered_pdf(src, n)
    n_a, n_b = write_duplex(src, list(range(1, n + 1)), a, b)
    widths_a = [float(p.mediabox.width) - 100 for p in PdfReader(a).pages]
    widths_b = [float(p.mediabox.width) - 100 for p in PdfReader(b).pages]
    odd, even = split_pages(list(range(1, n + 1)))
    assert widths_a == odd
    # La pàgina en blanc copia la mida de l'última pàgina triada
    assert widths_b == [p if p is not None else n for p in even]
    assert n_a == len(odd) and n_b == len(even)
    # Mateix nombre de fulls a les dues tandes
    assert n_a == n_b


def test_blank_page_is_really_blank(tmp_path):
    src, a, b = tmp_path / "src.pdf", tmp_path / "a.pdf", tmp_path / "b.pdf"
    _numbered_pdf(src, 3)
    write_duplex(src, [1, 2, 3], a, b)
    blank = PdfReader(b).pages[0]
    assert not blank.get_contents()


def test_parse_ranges():
    assert parse_ranges("1-3,5", 6) == [1, 2, 3, 5]
    assert parse_ranges(" 5, 1-2 ,2", 6) == [1, 2, 5]
    assert to_ranges([1, 2, 3, 5, 7, 8]) == "1-3,5,7-8"
    for bad in ["0", "3-1", "7", "a", "1-", ""]:
        with pytest.raises(RangeError):
            parse_ranges(bad, 6)
