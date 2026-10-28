"""Purgat d'uploads: els fitxers marxen, les metadades de l'historial es queden."""

import asyncio
import logging
import time

from sqlmodel import Session, select

from ..config import Settings
from ..db import get_engine
from ..models import DuplexBatch, Upload, utcnow

log = logging.getLogger(__name__)

EVERY_SECONDS = 15 * 60


def purge(settings: Settings) -> int:
    removed = 0
    with Session(get_engine()) as s:
        expired = s.exec(
            select(Upload).where(Upload.expires_at <= utcnow()).where(Upload.pdf_path.is_not(None))
        ).all()
        for u in expired:
            # El PDF i els derivats del dúplex comparteixen prefix
            for f in settings.uploads_dir.glob(f"{u.id}*"):
                f.unlink(missing_ok=True)
            u.pdf_path = None
            s.add(u)
            for b in s.exec(select(DuplexBatch).where(DuplexBatch.upload_id == u.id)).all():
                b.even_pdf_path = None
                if b.status == "waiting_flip":
                    b.status = "canceled"
                s.add(b)
            removed += 1
        s.commit()
    # Restes de pujades que han fallat a mitges
    for f in settings.uploads_dir.glob("*.tmp"):
        if time.time() - f.stat().st_mtime > 3600:
            f.unlink(missing_ok=True)
    if removed:
        log.info("Purgats %d fitxers caducats", removed)
    return removed


async def loop(settings: Settings) -> None:
    while True:
        try:
            await asyncio.to_thread(purge, settings)
        except Exception:  # noqa: BLE001
            log.exception("Error purgant uploads")
        await asyncio.sleep(EVERY_SECONDS)
