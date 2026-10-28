"""Errors de l'API sempre en JSON {error, message}, amb missatge en català."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, detail: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.detail = detail


HTTP_MESSAGES = {
    404: ("not_found", "Aquí no hi ha res."),
    405: ("method_not_allowed", "Aquesta acció no es pot fer així."),
    413: ("too_large", "El fitxer és massa gros."),
}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError):
        if exc.detail:
            log.warning("%s: %s", exc.code, exc.detail)
        return JSONResponse({"error": exc.code, "message": exc.message}, status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code, msg = HTTP_MESSAGES.get(exc.status_code, ("http_error", "Alguna cosa no ha anat bé."))
        return JSONResponse({"error": code, "message": msg}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(x) for x in first.get("loc", [])[1:]) or "petició"
        return JSONResponse(
            {"error": "validation", "message": f"Hi ha alguna dada incorrecta ({field})."},
            status_code=422,
        )
