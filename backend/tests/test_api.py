import asyncio

from app.api.events import event_stream

from .conftest import fast_forward, make_pdf


def test_health(client):
    r = client.get("/api/health")
    assert r.json()["status"] == "ok"
    assert r.json()["backend"] == "mock"


# --- perfils ---


def test_profiles_crud(client):
    assert client.get("/api/profiles").json() == []
    r = client.post("/api/profiles", json={"name": "  Pau ", "emoji": "🐸", "color": "#b5e8c0"})
    assert r.status_code == 201
    p = r.json()
    assert p["name"] == "Pau" and p["color"] == "#B5E8C0"
    dup = client.post("/api/profiles", json={"name": "pau", "emoji": "🐸", "color": "#B5E8C0"})
    assert dup.status_code == 409
    assert dup.json()["error"] == "name_taken"
    r = client.patch(f"/api/profiles/{p['id']}", json={"emoji": "🦉"})
    assert r.json()["emoji"] == "🦉"
    assert client.delete(f"/api/profiles/{p['id']}").status_code == 204
    assert client.get("/api/profiles").json() == []


def test_profile_validation_message_in_catalan(client):
    r = client.post("/api/profiles", json={"name": "X", "emoji": "🐸", "color": "vermell"})
    assert r.status_code == 422
    assert r.json()["error"] == "validation"
    assert "incorrecta" in r.json()["message"]


# --- impressora ---


def test_printer_status(client, mock):
    p = client.get("/api/printer").json()
    assert p["online"] is True
    assert p["queue"] == {"enabled": True, "accepting": True, "reason": None}
    assert [m["name"] for m in p["markers"]] == ["Color", "Black"]
    assert p["markers"][0]["colors"] == ["#00CFFF", "#F200FF", "#FFDA00"]
    assert "iso_a4_210x297mm" in p["capabilities"]["media"]
    assert p["alerts"] == []  # spool-area-full-report s'amaga


def test_printer_conditions(client):
    client.post("/api/mock/condition", json={"condition": "no_paper"})
    p = client.get("/api/printer").json()
    assert p["state"] == "stopped"
    assert "E02" in p["alerts"][0]["message"]
    client.post("/api/mock/condition", json={"condition": "offline"})
    p = client.get("/api/printer").json()
    assert p["online"] is False and p["state"] == "offline"
    assert p["alerts"][0]["message"] == "Apagada o desconnectada."


def test_pause_resume(client):
    assert client.post("/api/printer/pause").json()["queue"]["enabled"] is False
    assert client.post("/api/printer/resume").json()["queue"]["enabled"] is True


# --- pujades ---


def test_upload_pdf_and_download(client, upload):
    up = upload(5)
    assert up["pages"] == 5
    r = client.get(up["pdf_url"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


def test_upload_rejects_unsupported(client):
    r = client.post("/api/uploads", files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415
    assert r.json()["error"] == "unsupported_format"


def test_upload_too_large(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    big = make_pdf(1) + b"0" * (1024 * 1024 + 10)
    r = client.post("/api/uploads", files={"file": ("gros.pdf", big, "application/pdf")})
    assert r.status_code == 413
    assert list(settings.uploads_dir.iterdir()) == []


def test_upload_image(client):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), "red").save(buf, format="PNG")
    r = client.post("/api/uploads", files={"file": ("foto.png", buf.getvalue(), "image/png")})
    assert r.status_code == 201
    assert r.json()["pages"] == 1


# --- treballs ---


def _job(client, profile, up, **opts):
    r = client.post("/api/jobs", json={"upload_id": up["id"], "profile_id": profile["id"], "options": opts})
    assert r.status_code == 201, r.text
    return r.json()["items"]


def test_job_lifecycle(client, mock, profile, upload):
    up = upload(3)
    (job,) = _job(client, profile, up, copies=2, pages="1-2", color_mode="monochrome")
    assert job["pages"] == 2 and job["copies"] == 2 and job["color"] is False
    assert job["profile"]["name"] == "Anna"
    assert mock._jobs[job["cups_job_id"]].name == "Anna · factura.pdf"
    active = client.get("/api/jobs?scope=active").json()["items"]
    assert [j["id"] for j in active] == [job["id"]]

    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    assert client.get("/api/jobs?scope=active").json()["items"] == []
    today = client.get("/api/jobs?scope=today").json()["items"]
    assert today[0]["state"] == "completed"
    assert today[0]["progress"] == 1.0
    assert today[0]["reprintable"] is True


def test_cancel_hold_release(client, mock, profile, upload):
    up = upload(2)
    a = _job(client, profile, up)[0]
    b = _job(client, profile, up)[0]
    # El primer passa a imprimir; el segon queda pendent
    r = client.post(f"/api/jobs/{b['id']}/hold")
    assert r.json()["state"] == "held"
    r = client.post(f"/api/jobs/{b['id']}/release")
    assert r.json()["state"] in ("pending", "processing")
    r = client.post(f"/api/jobs/{a['id']}/cancel")
    assert r.json()["state"] == "canceled"
    r = client.post(f"/api/jobs/{a['id']}/cancel")
    assert r.status_code == 409


def test_job_bad_options(client, profile, upload):
    up = upload(2)
    r = client.post("/api/jobs", json={"upload_id": up["id"], "profile_id": profile["id"], "options": {"pages": "1-9"}})
    assert r.status_code == 400 and r.json()["error"] == "bad_pages"
    r = client.post("/api/jobs", json={"upload_id": up["id"], "profile_id": profile["id"], "options": {"media": "A0"}})
    assert r.status_code == 400
    r = client.post("/api/jobs", json={"upload_id": up["id"], "profile_id": 999})
    assert r.json()["error"] == "profile_not_found"
    r = client.post("/api/jobs", json={"upload_id": "nope", "profile_id": profile["id"]})
    assert r.status_code == 410


def test_jobs_wait_without_paper(client, mock, profile, upload):
    client.post("/api/mock/condition", json={"condition": "no_paper"})
    job = _job(client, profile, upload(1))[0]
    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    assert client.get("/api/jobs?scope=active").json()["items"][0]["id"] == job["id"]
    client.post("/api/mock/condition", json={"condition": "ok"})
    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    assert client.get("/api/jobs?scope=active").json()["items"] == []


def test_deleted_profile_kept_in_history(client, mock, profile, upload):
    _job(client, profile, upload(1))
    client.delete(f"/api/profiles/{profile['id']}")
    item = client.get("/api/jobs?scope=history").json()["items"][0]
    assert item["profile"]["deleted"] is True


# --- dúplex ---


def test_manual_duplex_flow(client, mock, profile, upload):
    up = upload(5)
    (job,) = _job(client, profile, up, duplex_manual=True)
    assert job["pages"] == 3 and job["duplex"]["stage"] == 1
    batch = job["duplex"]["batch_id"]
    assert client.post(f"/api/duplex/{batch}/continue").status_code == 409

    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    waiting = client.get("/api/jobs?scope=active").json()["duplex_waiting"]
    assert waiting[0]["batch_id"] == batch

    r = client.post(f"/api/duplex/{batch}/continue")
    assert r.status_code == 201
    second = r.json()
    assert second["duplex"]["stage"] == 2 and second["pages"] == 3  # 4, 2 + blanc
    assert mock._jobs[second["cups_job_id"]].name.endswith("(cara B)")


def test_duplex_requires_single_copy(client, profile, upload):
    r = client.post(
        "/api/jobs",
        json={"upload_id": upload(4)["id"], "profile_id": profile["id"], "options": {"duplex_manual": True, "copies": 2}},
    )
    assert r.json()["error"] == "duplex_copies"


def test_duplex_cancel(client, mock, profile, upload):
    (job,) = _job(client, profile, upload(2), duplex_manual=True)
    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    r = client.post(f"/api/duplex/{job['duplex']['batch_id']}/cancel")
    assert r.json()["status"] == "canceled"
    assert client.get("/api/jobs?scope=active").json()["duplex_waiting"] == []


# --- reimprimir, historial, estadístiques ---


def test_reprint_and_stats(client, mock, profile, upload):
    up = upload(4)
    (job,) = _job(client, profile, up, copies=2, color_mode="monochrome")
    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())
    r = client.post(f"/api/jobs/{job['id']}/reprint")
    assert r.status_code == 201
    fast_forward(mock, 100)
    asyncio.run(client.app.state.hub.refresh_jobs())

    st = client.get("/api/stats").json()
    assert st["total_pages"] == 16 and st["mono_pages"] == 16 and st["color_pct"] == 0
    assert st["ranking"][0]["profile"]["name"] == "Anna"
    assert st["ranking"][0]["jobs"] == 2

    hist = client.get(f"/api/jobs?scope=history&profile={profile['id']}").json()
    assert hist["total"] == 2
    assert client.get("/api/jobs?scope=history&profile=999").json()["total"] == 0
    assert client.get("/api/stats?month=nope").status_code == 400


def test_retention_purge(client, settings, profile, upload):
    from datetime import timedelta

    from sqlmodel import Session

    from app.db import get_engine
    from app.models import Upload, utcnow
    from app.services.retention import purge

    up = upload(1)
    _job(client, profile, up)
    with Session(get_engine()) as s:
        u = s.get(Upload, up["id"])
        u.expires_at = utcnow() - timedelta(minutes=1)
        s.add(u)
        s.commit()
    assert purge(settings) == 1
    assert client.get(up["pdf_url"]).status_code == 404
    item = client.get("/api/jobs?scope=history").json()["items"][0]
    assert item["reprintable"] is False


# --- SSE ---


def test_sse_initial_events_and_publish(client):
    hub = client.app.state.hub

    async def run():
        gen = event_stream(hub)
        assert (await anext(gen)).startswith("retry:")
        assert (await anext(gen)).startswith("event: printer")
        assert (await anext(gen)).startswith("event: jobs")
        hub.publish("job_done", {"id": 1, "state": "completed"})
        msg = await anext(gen)
        await gen.aclose()
        return msg

    msg = asyncio.run(run())
    assert msg.startswith("event: job_done")
    assert '"state": "completed"' in msg


def test_sse_route_registered(client):
    # No llegim el flux infinit; n'hi ha prou amb saber que hi és
    assert "/api/events" in client.get("/api/openapi.json").json()["paths"]
