from fastapi import APIRouter

from . import duplex, events, jobs, mock, printer, profiles, stats, uploads


def build_router(with_mock: bool) -> APIRouter:
    router = APIRouter(prefix="/api")
    for mod in (profiles, printer, uploads, jobs, duplex, stats, events):
        router.include_router(mod.router)
    if with_mock:
        router.include_router(mock.router)
    return router
