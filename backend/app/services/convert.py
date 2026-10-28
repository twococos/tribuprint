"""Conversió de qualsevol fitxer suportat a PDF + recompte de pàgines."""

import io
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import img2pdf
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from pypdf import PdfReader
from pypdf.errors import PdfReadError

register_heif_opener()
log = logging.getLogger(__name__)

PDF_EXT = {".pdf"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif"}
TEXT_EXT = {".txt", ".text", ".md", ".csv", ".log"}
OFFICE_EXT = {".doc", ".docx", ".odt", ".rtf", ".xls", ".xlsx", ".ods", ".ppt", ".pptx", ".odp"}

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "C:/Windows/Fonts/consola.ttf",
]


class ConvertError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def supported_extensions(office: bool) -> set[str]:
    exts = PDF_EXT | IMAGE_EXT | TEXT_EXT
    return exts | OFFICE_EXT if office else exts


def kind_of(name: str, office: bool) -> str:
    ext = Path(name).suffix.lower()
    if ext in PDF_EXT:
        return "pdf"
    if ext in IMAGE_EXT:
        return "image"
    if ext in TEXT_EXT:
        return "text"
    if ext in OFFICE_EXT:
        if office:
            return "office"
        raise ConvertError(
            "office_disabled",
            "Els documents d'Office encara no estan activats. Desa'l com a PDF i torna-ho a provar.",
        )
    raise ConvertError(
        "unsupported_format",
        f"No sé imprimir fitxers «{ext or name}». Prova amb PDF, imatges o text.",
    )


def count_pages(pdf: Path) -> int:
    try:
        reader = PdfReader(pdf)
        if reader.is_encrypted and not reader.decrypt(""):
            raise ConvertError("pdf_encrypted", "Aquest PDF té contrasenya. Treu-la-hi i torna-ho a provar.")
        n = len(reader.pages)
    except ConvertError:
        raise
    except (PdfReadError, Exception) as exc:  # noqa: BLE001  qualsevol PDF trencat
        log.info("PDF il·legible: %s", exc)
        raise ConvertError("pdf_invalid", "Aquest PDF sembla malmès. No el puc obrir.") from exc
    if n == 0:
        raise ConvertError("pdf_empty", "Aquest PDF no té cap pàgina.")
    return n


def image_to_pdf(src: Path, dst: Path) -> None:
    try:
        with Image.open(src) as im:
            frames = []
            for i in range(getattr(im, "n_frames", 1)):
                im.seek(i)
                frame = ImageOps.exif_transpose(im.copy())
                if frame.mode in ("RGBA", "LA", "P"):
                    frame = frame.convert("RGBA")
                    bg = Image.new("RGB", frame.size, "white")
                    bg.paste(frame, mask=frame.split()[-1])
                    frame = bg
                elif frame.mode not in ("RGB", "L"):
                    frame = frame.convert("RGB")
                buf = io.BytesIO()
                frame.save(buf, format="JPEG", quality=92)
                frames.append(buf.getvalue())
                if im.format == "GIF":
                    break  # dels GIF animats, només el primer fotograma
    except Exception as exc:  # noqa: BLE001
        raise ConvertError("image_invalid", "No puc llegir aquesta imatge.") from exc
    dst.write_bytes(img2pdf.convert(frames))


def text_to_pdf(src: Path, dst: Path) -> None:
    from fpdf import FPDF

    raw = src.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    text = text.replace("\r\n", "\n").replace("\t", "    ")

    pdf = FPDF(format="A4")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=18)
    font = next((f for f in FONT_CANDIDATES if Path(f).exists()), None)
    if font:
        pdf.add_font("mono", fname=font)
        pdf.set_font("mono", size=10)
    else:
        pdf.set_font("Courier", size=10)
        text = text.encode("latin-1", "replace").decode("latin-1")
    pdf.add_page()
    pdf.multi_cell(0, 5, text or " ", new_x="LMARGIN", new_y="NEXT")
    pdf.output(str(dst))


def office_to_pdf(src: Path, dst: Path) -> None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise ConvertError("office_unavailable", "LibreOffice no està instal·lat al servidor.")
    with tempfile.TemporaryDirectory() as tmp:
        # LibreOffice necessita un perfil escrivible
        env = {**os.environ, "HOME": tmp}
        try:
            subprocess.run(
                [soffice, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, str(src)],
                check=True,
                capture_output=True,
                timeout=180,
                env=env,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            log.warning("LibreOffice ha fallat: %s", exc)
            raise ConvertError("office_failed", "LibreOffice no ha pogut convertir el document.") from exc
        out = Path(tmp) / (src.stem + ".pdf")
        if not out.exists():
            raise ConvertError("office_failed", "LibreOffice no ha generat cap PDF.")
        shutil.move(out, dst)


def to_pdf(src: Path, original_name: str, dst: Path, office: bool = False) -> int:
    """Converteix `src` a `dst` (PDF) i retorna el nombre de pàgines."""
    kind = kind_of(original_name, office)
    if kind == "pdf":
        pages = count_pages(src)
        shutil.copyfile(src, dst)
        return pages
    if kind == "image":
        image_to_pdf(src, dst)
    elif kind == "text":
        text_to_pdf(src, dst)
    else:
        office_to_pdf(src, dst)
    return count_pages(dst)
