import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import errors
from .api import build_router
from .config import Settings, get_settings
from .db import init_db
from .printer.base import PrinterBackend
from .services import retention
from .services.poller import Hub

VERSION = "0.1.0"
log = logging.getLogger("tribuprint")


def make_backend(settings: Settings) -> PrinterBackend:
    if settings.printer_backend == "mock":
        from .printer.mock import MockPrinter

        return MockPrinter()
    from .printer.cups_ipp import CupsIppPrinter

    return CupsIppPrinter(settings.cups_server, settings.cups_printer, settings.ippusb_url, settings.cups_user)


def create_app(settings: Settings | None = None, start_background: bool = True) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        hub = Hub(make_backend(settings), settings)
        app.state.hub = hub
        tasks = []
        if start_background:
            hub.start()
            tasks.append(asyncio.create_task(retention.loop(settings), name="retention"))
        log.info("TribuPrint %s amb backend %s", VERSION, settings.printer_backend)
        yield
        await hub.stop()
        for t in tasks:
            t.cancel()
        await hub.backend.close()

    app = FastAPI(title="TribuPrint", version=VERSION, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.settings = settings
    errors.install(app)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION, "backend": settings.printer_backend}

    app.include_router(build_router(with_mock=settings.printer_backend == "mock"))

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    return app
