import pytest
from PIL import Image
from pypdf import PdfReader

from app.services.convert import ConvertError, count_pages, kind_of, to_pdf

from .conftest import make_pdf


def test_pdf_passthrough(tmp_path):
    src = tmp_path / "in.pdf"
    src.write_bytes(make_pdf(4))
    assert to_pdf(src, "doc.pdf", tmp_path / "out.pdf") == 4


def test_broken_pdf(tmp_path):
    src = tmp_path / "in.pdf"
    src.write_bytes(b"%PDF-1.4 tot trencat")
    with pytest.raises(ConvertError) as e:
        to_pdf(src, "doc.pdf", tmp_path / "out.pdf")
    assert e.value.code == "pdf_invalid"


@pytest.mark.parametrize(("fmt", "ext", "mode"), [("JPEG", ".jpg", "RGB"), ("PNG", ".png", "RGBA"), ("WEBP", ".webp", "RGB")])
def test_image(tmp_path, fmt, ext, mode):
    src = tmp_path / f"foto{ext}"
    Image.new(mode, (640, 480), "orange").save(src, format=fmt)
    out = tmp_path / "out.pdf"
    assert to_pdf(src, src.name, out) == 1
    page = PdfReader(out).pages[0]
    assert float(page.mediabox.width) > float(page.mediabox.height)  # apaïsada


def test_image_exif_rotation(tmp_path):
    src = tmp_path / "mobil.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # girada 90°
    Image.new("RGB", (640, 480), "blue").save(src, exif=exif)
    out = tmp_path / "out.pdf"
    to_pdf(src, src.name, out)
    page = PdfReader(out).pages[0]
    assert float(page.mediabox.width) < float(page.mediabox.height)


def test_heic(tmp_path):
    from pillow_heif import from_pillow

    src = tmp_path / "IMG_0001.HEIC"
    from_pillow(Image.new("RGB", (320, 200), "green")).save(src)
    out = tmp_path / "out.pdf"
    assert to_pdf(src, src.name, out) == 1


def test_txt_with_accents_and_many_pages(tmp_path):
    src = tmp_path / "llista.txt"
    src.write_text("Llista de la compra: pa, oli, formatge, l·lusió, ç\n" * 200, encoding="utf-8")
    out = tmp_path / "out.pdf"
    pages = to_pdf(src, src.name, out)
    assert pages > 1
    assert count_pages(out) == pages


def test_unsupported_and_office(tmp_path):
    with pytest.raises(ConvertError) as e:
        kind_of("virus.exe", office=False)
    assert e.value.code == "unsupported_format"
    with pytest.raises(ConvertError) as e:
        kind_of("carta.docx", office=False)
    assert e.value.code == "office_disabled"
    assert kind_of("carta.docx", office=True) == "office"
