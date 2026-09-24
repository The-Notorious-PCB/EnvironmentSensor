from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession

from app.main import create_app
from app.models.db import Reading


@pytest.fixture
def client():
    app = create_app(database_url="sqlite://", start_serial=False)
    with TestClient(app) as c:
        yield c


def test_cors_allows_configured_dashboard_origin(client):
    # The dashboard runs on a different origin (Vite dev server) than this
    # API — without a matching Access-Control-Allow-Origin header, a real
    # browser silently blocks the response even though the request
    # succeeds server-side (this is invisible to curl/TestClient calls
    # that don't send an Origin header, which is how this gap first shipped).
    r = client.get("/sessions", headers={"Origin": "http://127.0.0.1:5173"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_cors_rejects_unconfigured_origin(client):
    r = client.get("/sessions", headers={"Origin": "http://evil.example.com"})
    assert r.status_code == 200  # request still succeeds server-side...
    assert "access-control-allow-origin" not in r.headers  # ...but the browser would block it


def test_health_check_with_no_active_session(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["active_session_id"] is None
    assert body["serial"] is None  # start_serial=False in this fixture


def test_session_lifecycle_rejects_concurrent_session(client):
    r = client.post("/sessions", json={"subject_id": "subject-01", "suit_config": "mock suit"})
    assert r.status_code == 201
    session = r.json()
    assert session["end_time"] is None

    r_conflict = client.post("/sessions", json={"subject_id": "subject-02", "suit_config": "x"})
    assert r_conflict.status_code == 409

    r_list = client.get("/sessions")
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1

    r_health = client.get("/health")
    assert r_health.json()["active_session_id"] == session["session_id"]

    r_stop = client.post(f"/sessions/{session['session_id']}/stop")
    assert r_stop.status_code == 200
    assert r_stop.json()["end_time"] is not None

    r_health_after = client.get("/health")
    assert r_health_after.json()["active_session_id"] is None

    # a new session can start now that the previous one stopped
    r_new = client.post("/sessions", json={"subject_id": "subject-02", "suit_config": "x"})
    assert r_new.status_code == 201


def test_stop_unknown_session_is_404(client):
    r = client.post("/sessions/does-not-exist/stop")
    assert r.status_code == 404


def test_readings_endpoint_returns_stored_rows(client):
    r = client.post("/sessions", json={"subject_id": "subject-01", "suit_config": "mock"})
    session_id = r.json()["session_id"]

    # insert directly, bypassing the serial/writer pipeline — this test is
    # about the readings endpoint, not ingestion
    engine = client.app.state.engine
    with DBSession(engine) as db:
        db.add(
            Reading(
                session_id=session_id,
                node_id="helmet-01",
                sensor_type="co2",
                value=800.0,
                unit="ppm",
                timestamp=datetime.now(timezone.utc),
                seq=1,
            )
        )
        db.commit()

    r_readings = client.get(f"/sessions/{session_id}/readings")
    assert r_readings.status_code == 200
    rows = r_readings.json()
    assert len(rows) == 1
    assert rows[0]["node_id"] == "helmet-01"
    assert rows[0]["seq"] == 1


def test_readings_endpoint_404s_for_unknown_session(client):
    r = client.get("/sessions/does-not-exist/readings")
    assert r.status_code == 404


def test_websocket_connects_and_disconnects_cleanly(client):
    with client.websocket_connect("/ws/live") as ws:
        broadcast_manager = client.app.state.broadcast_manager
        assert len(broadcast_manager._clients) == 1
    # after the `with` block exits the client has disconnected; the
    # endpoint's cleanup runs on the server's event loop asynchronously, so
    # there's no synchronous point here to assert it's been removed —
    # covered instead by test_broadcast.py's disconnect test.
