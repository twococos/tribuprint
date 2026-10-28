import asyncio
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, UploadFile
from fastapi.responses import FileResponse

from ..errors import ApiError
from ..models import Upload, utcnow
from ..services.convert import ConvertError, kind_of, to_pdf
from ..services.jobs import iso, upload_available
from .deps import SessionDep, SettingsDep

router = APIRouter(prefix="/uploads", tags=["pujades"])

CHUNK = 1024 * 1024


def _safe_name(name: str | None) -> str:
    name = Path(name or "document").name.strip() or "document"
    return name[:120]


@router.post("", status_code=201)
async def create_upload(file: UploadFile, s: SessionDep, settings: SettingsDep):
    name = _safe_name(file.filename)
    try:
        kind_of(name, settings.enable_office)
    except ConvertError as exc:
        raise ApiError(415, exc.code, exc.message) from exc

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex
    # Conservem l'extensió: LibreOffice i Pillow la fan servir
    tmp = settings.uploads_dir / f"{upload_id}-src{Path(name).suffix.lower()}.tmp"
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    try:
        with open(tmp, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise ApiError(413, "too_large", f"El fitxer passa de {settings.max_upload_mb} MB. Massa paper!")
                out.write(chunk)
        if size == 0:
            raise ApiError(400, "empty_file", "El fitxer és buit.")
        src = tmp.with_suffix("")  # treu ".tmp", deixa l'extensió original
        tmp.replace(src)
        pdf = settings.uploads_dir / f"{upload_id}.pdf"
        try:
            pages = await asyncio.to_thread(to_pdf, src, name, pdf, settings.enable_office)
        except ConvertError as exc:
            pdf.unlink(missing_ok=True)
            raise ApiError(415, exc.code, exc.message) from exc
        finally:
            src.unlink(missing_ok=True)
    finally:
        tmp.unlink(missing_ok=True)

    up = Upload(
        id=upload_id,
        original_name=name,
        mime=file.content_type or "application/octet-stream",
        pdf_path=str(pdf),
        pages=pages,
        size_bytes=size,
        expires_at=utcnow() + timedelta(hours=settings.retention_hours),
    )
    s.add(up)
    s.commit()
    return {
        "id": upload_id,
        "name": name,
        "pages": pages,
        "pdf_url": f"/api/uploads/{upload_id}/pdf",
        "size": size,
        "expires_at": iso(up.expires_at),
    }


@router.get("/{upload_id}/pdf")
def get_pdf(upload_id: str, s: SessionDep):
    up = s.get(Upload, upload_id)
    if not upload_available(up):
        raise ApiError(404, "not_found", "Aquest fitxer ja no hi és.")
    return FileResponse(up.pdf_path, media_type="application/pdf", filename=Path(up.original_name).stem + ".pdf")
