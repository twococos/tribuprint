import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..services.poller import Hub, sse_format
from .deps import HubDep

router = APIRouter(tags=["temps real"])

HEARTBEAT = 15.0


async def event_stream(hub: Hub, request: Request | None = None) -> AsyncIterator[str]:
    # Estat inicial, perquè el client no hagi d'esperar el primer canvi
    printer = hub.printer or await hub.refresh_printer()
    if hub.jobs is None:
        await hub.refresh_jobs()
    q = hub.subscribe()
    try:
        yield "retry: 3000\n\n"
        yield sse_format("printer", printer)
        yield sse_format("jobs", hub.jobs)
        while True:
            if request is not None and await request.is_disconnected():
                break
            try:
                event, data = await asyncio.wait_for(q.get(), timeout=HEARTBEAT)
                yield sse_format(event, data)
            except TimeoutError:
                yield ": ping\n\n"
    finally:
        hub.unsubscribe(q)


@router.get("/events")
async def events(request: Request, hub: HubDep):
    return StreamingResponse(
        event_stream(hub, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
