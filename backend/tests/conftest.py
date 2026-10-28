import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


def make_pdf(pages: int, width: float = 595, height: float = 842) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=width, height=height)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setenv("PRINTER_BACKEND", "mock")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "no-static"))
    get_settings.cache_clear()
    db.reset_engine()
    s = Settings()
    yield s
    db.reset_engine()
    get_settings.cache_clear()


@pytest.fixture
def client(settings):
    app = create_app(settings, start_background=False)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mock(client):
    return client.app.state.hub.backend


def fast_forward(mock, seconds: float) -> None:
    mock._last -= seconds


@pytest.fixture
def profile(client):
    return client.post("/api/profiles", json={"name": "Anna", "emoji": "🦊", "color": "#FFC8A2"}).json()


@pytest.fixture
def upload(client):
    def _up(pages: int = 3, name: str = "factura.pdf"):
        r = client.post("/api/uploads", files={"file": (name, make_pdf(pages), "application/pdf")})
        assert r.status_code == 201, r.text
        return r.json()

    return _up
