"""Lògica de treballs: enviar, dúplex, reimprimir, llistar i estadístiques."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field
from sqlmodel import Session, col, func, select

from ..config import Settings
from ..errors import ApiError
from ..models import DuplexBatch, Job, Profile, Upload, utcnow
from ..printer.base import FINAL_JOB_STATES, PrinterBackend, PrinterError, SubmitOptions
from . import duplex as duplex_service
from .pages import RangeError, parse_ranges, to_ranges

PAGE_SIZE = 20


class JobOptions(BaseModel):
    copies: int = Field(1, ge=1, le=99)
    pages: str | None = None
    color_mode: str = "color"
    quality: str = "normal"
    media: str = "iso_a4_210x297mm"
    scaling: str = "fit"
    orientation: str = "auto"
    duplex_manual: bool = False


class JobCreate(BaseModel):
    upload_id: str
    profile_id: int
    options: JobOptions = JobOptions()


# --- serialització ---


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def profile_dict(p: Profile | None) -> dict[str, Any] | None:
    if p is None:
        return None
    return {
        "id": p.id,
        "name": p.name,
        "emoji": p.emoji,
        "color": p.color,
        "deleted": p.deleted_at is not None,
    }


def upload_available(u: Upload | None) -> bool:
    return bool(u and u.pdf_path and u.expires_at > utcnow() and Path(u.pdf_path).exists())


def job_dict(s: Session, job: Job, profiles: dict[int, Profile] | None = None) -> dict[str, Any]:
    if profiles is not None:
        profile = profiles.get(job.profile_id) if job.profile_id else None
    else:
        profile = s.get(Profile, job.profile_id) if job.profile_id else None
    total = max(1, job.pages * job.copies)
    progress = None
    if job.state == "completed":
        progress = 1.0
    elif job.sheets_completed is not None:
        progress = min(1.0, job.sheets_completed / total)
    duplex = None
    if job.duplex_batch_id:
        batch = s.get(DuplexBatch, job.duplex_batch_id)
        duplex = {"batch_id": job.duplex_batch_id, "stage": job.duplex_stage, "status": batch.status if batch else None}
    upload = s.get(Upload, job.upload_id) if job.upload_id else None
    return {
        "id": job.id,
        "number": f"{job.id:04d}",
        "cups_job_id": job.cups_job_id,
        "filename": job.filename,
        "pages": job.pages,
        "copies": job.copies,
        "options": json.loads(job.options_json or "{}"),
        "color": job.color,
        "state": job.state,
        "state_reason": job.state_reason,
        "progress": progress,
        "sheets_completed": job.sheets_completed,
        "sheets_total": total,
        "created_at": iso(job.created_at),
        "completed_at": iso(job.completed_at),
        "profile": profile_dict(profile),
        "duplex": duplex,
        "reprintable": job.state in FINAL_JOB_STATES and upload_available(upload),
    }


def _profiles(s: Session) -> dict[int, Profile]:
    return {p.id: p for p in s.exec(select(Profile)).all()}


def today_start_utc(settings: Settings) -> datetime:
    tz = ZoneInfo(settings.tz)
    local = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(UTC)


def queue_payload(s: Session, settings: Settings) -> dict[str, Any]:
    profiles = _profiles(s)
    active = s.exec(
        select(Job).where(col(Job.state).not_in(FINAL_JOB_STATES)).order_by(col(Job.id))
    ).all()
    today = s.exec(
        select(Job)
        .where(col(Job.state).in_(FINAL_JOB_STATES))
        .where(Job.created_at >= today_start_utc(settings))
        .order_by(col(Job.id).desc())
    ).all()
    waiting = s.exec(select(DuplexBatch).where(DuplexBatch.status == "waiting_flip")).all()
    return {
        "active": [job_dict(s, j, profiles) for j in active],
        "today": [job_dict(s, j, profiles) for j in today],
        "duplex_waiting": [duplex_dict(s, b, profiles) for b in waiting],
    }


def duplex_dict(s: Session, b: DuplexBatch, profiles: dict[int, Profile] | None = None) -> dict[str, Any]:
    odd = s.get(Job, b.odd_job_id) if b.odd_job_id else None
    profile = None
    if odd and odd.profile_id:
        profile = (profiles or {}).get(odd.profile_id) or s.get(Profile, odd.profile_id)
    return {
        "batch_id": b.id,
        "status": b.status,
        "filename": odd.filename if odd else "",
        "odd_job_id": b.odd_job_id,
        "even_job_id": b.even_job_id,
        "profile": profile_dict(profile),
    }


# --- crear ---


def _get_profile(s: Session, profile_id: int) -> Profile:
    p = s.get(Profile, profile_id)
    if p is None or p.deleted_at is not None:
        raise ApiError(400, "profile_not_found", "Aquest perfil no existeix. Tria qui imprimeix.")
    return p


def _get_upload(s: Session, upload_id: str) -> Upload:
    u = s.get(Upload, upload_id)
    if not upload_available(u):
        raise ApiError(410, "upload_expired", "Aquest fitxer ja no és al servidor. Torna'l a pujar.")
    return u


def validate_options(opts: JobOptions, caps: dict[str, Any]) -> None:
    checks = [
        ("color_mode", caps.get("color_modes"), "Mode de color no suportat."),
        ("quality", caps.get("qualities"), "Qualitat no suportada."),
        ("media", caps.get("media"), "Mida de paper no suportada."),
        ("scaling", caps.get("scaling"), "Ajust no suportat."),
    ]
    for key, allowed, msg in checks:
        if allowed and getattr(opts, key) not in allowed:
            raise ApiError(400, "bad_option", msg)
    if opts.orientation not in ("auto", "portrait", "landscape"):
        raise ApiError(400, "bad_option", "Orientació no vàlida.")
    if opts.copies > int(caps.get("copies_max") or 99):
        raise ApiError(400, "bad_option", "Massa còpies.")


def _title(profile: Profile, filename: str, suffix: str = "") -> str:
    return f"{profile.name} · {filename}{suffix}"


async def _submit(backend: PrinterBackend, pdf: Path, title: str, opts: SubmitOptions) -> int:
    try:
        return await backend.submit(pdf, title, opts)
    except PrinterError as exc:
        raise ApiError(502, "printer_error", "CUPS no ha acceptat el treball.", detail=str(exc)) from exc


def _submit_opts(o: JobOptions, page_ranges: str | None, copies: int | None = None) -> SubmitOptions:
    return SubmitOptions(
        copies=copies or o.copies,
        page_ranges=page_ranges,
        color_mode=o.color_mode,
        quality=o.quality,
        media=o.media,
        scaling=o.scaling,
        orientation=o.orientation,
    )


async def create_job(
    s: Session, backend: PrinterBackend, caps: dict[str, Any], data: JobCreate
) -> list[Job]:
    profile = _get_profile(s, data.profile_id)
    upload = _get_upload(s, data.upload_id)
    o = data.options
    validate_options(o, caps)
    try:
        selected = parse_ranges(o.pages, upload.pages) if o.pages else list(range(1, upload.pages + 1))
    except RangeError as exc:
        raise ApiError(400, "bad_pages", str(exc)) from exc
    page_ranges = to_ranges(selected) if len(selected) != upload.pages else None
    color = o.color_mode in ("color", "auto")
    opts_json = o.model_dump_json()

    if o.duplex_manual and len(selected) > 1:
        if o.copies != 1:
            raise ApiError(400, "duplex_copies", "La doble cara manual només va amb una còpia. Envia'l més vegades.")
        return [await _create_duplex(s, backend, profile, upload, o, selected, color, opts_json)]

    cups_id = await _submit(backend, Path(upload.pdf_path), _title(profile, upload.original_name), _submit_opts(o, page_ranges))
    job = Job(
        cups_job_id=cups_id,
        profile_id=profile.id,
        upload_id=upload.id,
        filename=upload.original_name,
        pages=len(selected),
        copies=o.copies,
        options_json=opts_json,
        color=color,
    )
    s.add(job)
    s.commit()
    s.refresh(job)
    return [job]


async def _create_duplex(s, backend, profile, upload, o, selected, color, opts_json) -> Job:
    batch = DuplexBatch(upload_id=upload.id)
    s.add(batch)
    s.commit()
    s.refresh(batch)
    base = Path(upload.pdf_path)
    odd_pdf = base.with_name(f"{upload.id}-dx{batch.id}-a.pdf")
    even_pdf = base.with_name(f"{upload.id}-dx{batch.id}-b.pdf")
    n_odd, n_even = duplex_service.write_duplex(base, selected, odd_pdf, even_pdf)
    try:
        cups_id = await _submit(backend, odd_pdf, _title(profile, upload.original_name, " (cara A)"), _submit_opts(o, None))
    except ApiError:
        s.delete(batch)
        s.commit()
        raise
    job = Job(
        cups_job_id=cups_id,
        profile_id=profile.id,
        upload_id=upload.id,
        filename=upload.original_name,
        pages=n_odd,
        copies=1,
        options_json=opts_json,
        color=color,
        duplex_batch_id=batch.id,
        duplex_stage=1,
    )
    s.add(job)
    s.commit()
    s.refresh(job)
    batch.odd_job_id = job.id
    batch.even_pdf_path = str(even_pdf)
    s.add(batch)
    s.commit()
    return job


async def duplex_continue(s: Session, backend: PrinterBackend, batch_id: int) -> Job:
    batch = s.get(DuplexBatch, batch_id)
    if batch is None:
        raise ApiError(404, "not_found", "Aquesta doble cara no existeix.")
    if batch.status != "waiting_flip":
        raise ApiError(409, "duplex_not_ready", "Encara no toca girar els fulls.")
    if not batch.even_pdf_path or not Path(batch.even_pdf_path).exists():
        raise ApiError(410, "upload_expired", "El fitxer de la segona cara ja no hi és.")
    odd = s.get(Job, batch.odd_job_id)
    profile = s.get(Profile, odd.profile_id) if odd and odd.profile_id else None
    o = JobOptions.model_validate_json(odd.options_json) if odd else JobOptions()
    name = profile.name if profile else "Tribu"
    filename = odd.filename if odd else "document"
    from pypdf import PdfReader

    n_even = len(PdfReader(batch.even_pdf_path).pages)
    cups_id = await _submit(backend, Path(batch.even_pdf_path), f"{name} · {filename} (cara B)", _submit_opts(o, None, 1))
    job = Job(
        cups_job_id=cups_id,
        profile_id=odd.profile_id if odd else None,
        upload_id=batch.upload_id,
        filename=filename,
        pages=n_even,
        copies=1,
        options_json=odd.options_json if odd else "{}",
        color=odd.color if odd else True,
        duplex_batch_id=batch.id,
        duplex_stage=2,
    )
    s.add(job)
    s.commit()
    s.refresh(job)
    batch.even_job_id = job.id
    batch.status = "printing_even"
    s.add(batch)
    s.commit()
    return job


def duplex_cancel(s: Session, batch_id: int) -> DuplexBatch:
    batch = s.get(DuplexBatch, batch_id)
    if batch is None:
        raise ApiError(404, "not_found", "Aquesta doble cara no existeix.")
    if batch.status in ("done", "canceled"):
        return batch
    if batch.status != "waiting_flip":
        raise ApiError(409, "duplex_busy", "Cancel·la primer el treball que s'està imprimint.")
    batch.status = "canceled"
    s.add(batch)
    s.commit()
    return batch


async def reprint(s: Session, backend: PrinterBackend, caps: dict[str, Any], job_id: int, profile_id: int | None) -> list[Job]:
    job = s.get(Job, job_id)
    if job is None:
        raise ApiError(404, "not_found", "Aquest treball no existeix.")
    pid = profile_id or job.profile_id
    if pid is None:
        raise ApiError(400, "profile_not_found", "Tria qui imprimeix.")
    opts = JobOptions.model_validate_json(job.options_json or "{}")
    return await create_job(s, backend, caps, JobCreate(upload_id=job.upload_id or "", profile_id=pid, options=opts))


# --- historial i estadístiques ---


def history(s: Session, profile_id: int | None, page: int) -> dict[str, Any]:
    q = select(Job)
    cq = select(func.count()).select_from(Job)
    if profile_id:
        q = q.where(Job.profile_id == profile_id)
        cq = cq.where(Job.profile_id == profile_id)
    total = s.exec(cq).one()
    page = max(1, page)
    rows = s.exec(q.order_by(col(Job.id).desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
    profiles = _profiles(s)
    return {
        "items": [job_dict(s, j, profiles) for j in rows],
        "page": page,
        "page_size": PAGE_SIZE,
        "total": total,
        "pages": max(1, -(-total // PAGE_SIZE)),
    }


def month_bounds(month: str | None, settings: Settings) -> tuple[str, datetime, datetime]:
    tz = ZoneInfo(settings.tz)
    if month:
        try:
            y, m = (int(x) for x in month.split("-"))
            start = datetime(y, m, 1, tzinfo=tz)
        except ValueError as exc:
            raise ApiError(400, "bad_month", "El mes ha de ser AAAA-MM.") from exc
    else:
        now = datetime.now(tz)
        start = datetime(now.year, now.month, 1, tzinfo=tz)
    end = (start + timedelta(days=32)).replace(day=1)
    return f"{start.year:04d}-{start.month:02d}", start.astimezone(UTC), end.astimezone(UTC)


def stats(s: Session, month: str | None, settings: Settings) -> dict[str, Any]:
    label, start, end = month_bounds(month, settings)
    rows = s.exec(
        select(Job)
        .where(Job.state == "completed")
        .where(Job.completed_at >= start)
        .where(Job.completed_at < end)
    ).all()
    profiles = _profiles(s)
    per: dict[int | None, dict[str, Any]] = {}
    total = color_pages = 0
    for j in rows:
        n = j.pages * j.copies
        total += n
        if j.color:
            color_pages += n
        e = per.setdefault(j.profile_id, {"pages": 0, "color_pages": 0, "jobs": 0})
        e["pages"] += n
        e["jobs"] += 1
        if j.color:
            e["color_pages"] += n
    ranking = sorted(
        (
            {"profile": profile_dict(profiles.get(pid)) if pid else None, **v}
            for pid, v in per.items()
        ),
        key=lambda r: -r["pages"],
    )
    all_time = s.exec(
        select(func.coalesce(func.sum(Job.pages * Job.copies), 0)).where(Job.state == "completed")
    ).one()
    return {
        "month": label,
        "total_pages": total,
        "color_pages": color_pages,
        "mono_pages": total - color_pages,
        "color_pct": round(100 * color_pages / total) if total else 0,
        "jobs": len(rows),
        "ranking": ranking,
        "all_time_pages": int(all_time or 0),
    }
