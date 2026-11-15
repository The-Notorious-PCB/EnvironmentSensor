import asyncio
import contextlib
import json
from datetime import datetime, timezone

import httpx
from sqlmodel import Session as DBSession
from sqlmodel import select
from tenacity import stop_after_attempt, wait_fixed

from app.database import init_db, make_engine
from app.models.db import Reading
from app.sync.worker import _sync_once, run_sync_worker

FAST_RETRY = dict(retry_stop=stop_after_attempt(3), retry_wait=wait_fixed(0))
SYNC_URL = "https://example.supabase.co/rest/v1/rpc/ingest_readings"
HEADERS = {"apikey": "key", "Authorization": "Bearer key"}
DEVICE_ID = "76f6fde1-8a4d-43d4-85e5-b6366df95b73"
API_KEY = "device-api-key"


def base_reading(**overrides) -> dict:
    fields = dict(
        session_id="session-1",
        node_id="helmet-01",
        sensor_type="co2",
        value=800.0,
        unit="ppm",
        timestamp=datetime.now(timezone.utc),
        seq=1,
    )
    fields.update(overrides)
    return fields


def engine_with_readings(rows: list) -> object:
    engine = make_engine("sqlite://")
    init_db(engine)
    with DBSession(engine) as db:
        for row in rows:
            db.add(Reading(**row))
        db.commit()
    return engine


async def sync_once(engine, client, **overrides):
    kwargs = dict(
        device_id=DEVICE_ID,
        api_key=API_KEY,
        batch_size=500,
        **FAST_RETRY,
    )
    kwargs.update(overrides)
    return await _sync_once(engine, client, SYNC_URL, HEADERS, **kwargs)


async def test_sync_once_pushes_batch_via_rpc_and_marks_synced():
    engine = engine_with_readings(
        [base_reading(seq=1), base_reading(seq=2, node_id="chest-01")]
    )
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=2)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client)
    await client.aclose()

    assert synced_count == 2
    assert len(requests) == 1

    body = json.loads(requests[0].content)
    assert body["p_device_id"] == DEVICE_ID
    assert body["p_api_key"] == API_KEY
    readings = body["p_readings"]
    assert len(readings) == 2
    assert {row["node_id"] for row in readings} == {"helmet-01", "chest-01"}
    # device_id is tagged server-side by the RPC via p_device_id, not
    # per-row — these fields stay out of the row payload itself.
    assert "device_id" not in readings[0]
    assert "id" not in readings[0]
    assert "synced" not in readings[0]

    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert all(r.synced for r in rows)


async def test_sync_once_leaves_rows_unsynced_after_repeated_failure():
    engine = engine_with_readings([base_reading(seq=1)])
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(request)
        return httpx.Response(500, text="server error")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client)
    await client.aclose()

    assert synced_count == 0
    assert len(attempts) == 3  # retried up to stop_after_attempt(3)

    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert all(not r.synced for r in rows)


async def test_sync_once_rejects_wrong_api_key_like_supabase_would():
    # Mirrors what ingest_readings actually does on a bad key (verified
    # against real Postgres — see supabase/migrations): raises, PostgREST
    # surfaces it as a non-2xx response, no rows get marked synced.
    engine = engine_with_readings([base_reading(seq=1)])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "invalid device_id or api_key"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client, api_key="wrong-key")
    await client.aclose()

    assert synced_count == 0
    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert all(not r.synced for r in rows)


async def test_sync_once_recovers_after_transient_failure():
    engine = engine_with_readings([base_reading(seq=1)])
    responses = iter([httpx.Response(500), httpx.Response(200, json=1)])

    def handler(request: httpx.Request) -> httpx.Response:
        return next(responses)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client)
    await client.aclose()

    assert synced_count == 1
    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert all(r.synced for r in rows)


async def test_sync_once_does_nothing_when_no_unsynced_rows():
    engine = make_engine("sqlite://")
    init_db(engine)
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=0)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client)
    await client.aclose()

    assert synced_count == 0
    assert called is False


async def test_sync_once_skips_already_synced_rows():
    engine = engine_with_readings([base_reading(seq=1)])
    with DBSession(engine) as db:
        row = db.exec(select(Reading)).one()
        row.synced = True
        db.add(row)
        db.commit()

    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=0)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    synced_count = await sync_once(engine, client)
    await client.aclose()

    assert synced_count == 0
    assert called is False


async def test_run_sync_worker_loops_and_picks_up_new_rows():
    engine = make_engine("sqlite://")
    init_db(engine)
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=1)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    task = asyncio.create_task(
        run_sync_worker(
            engine=engine,
            supabase_url="https://example.supabase.co",
            supabase_key="key",
            device_id=DEVICE_ID,
            api_key=API_KEY,
            interval_seconds=0.02,
            client=client,
            **FAST_RETRY,
        )
    )
    await asyncio.sleep(0.01)  # let the first (empty) cycle run

    with DBSession(engine) as db:
        db.add(Reading(**base_reading(seq=1)))
        db.commit()

    await asyncio.sleep(0.08)  # a few more cycles at 0.02s interval
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await client.aclose()

    assert len(requests) >= 1
    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert rows[0].synced is True


async def test_run_sync_worker_calls_ingest_rpc_with_device_credentials():
    engine = engine_with_readings([base_reading(seq=1)])
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=1)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    task = asyncio.create_task(
        run_sync_worker(
            engine=engine,
            supabase_url="https://example.supabase.co",
            supabase_key="anon-key",
            device_id=DEVICE_ID,
            api_key=API_KEY,
            interval_seconds=10,  # only need the immediate first cycle
            client=client,
            **FAST_RETRY,
        )
    )
    await asyncio.sleep(0.02)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await client.aclose()

    assert seen["url"] == "https://example.supabase.co/rest/v1/rpc/ingest_readings"
    assert seen["headers"]["apikey"] == "anon-key"
    assert seen["headers"]["authorization"] == "Bearer anon-key"
    assert seen["headers"]["prefer"] == "return=minimal"
    assert seen["body"]["p_device_id"] == DEVICE_ID
    assert seen["body"]["p_api_key"] == API_KEY


async def test_run_sync_worker_uses_configurable_ingest_function_name():
    engine = engine_with_readings([base_reading(seq=1)])
    seen_url = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen_url["value"] = str(request.url)
        return httpx.Response(200, json=1)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    task = asyncio.create_task(
        run_sync_worker(
            engine=engine,
            supabase_url="https://example.supabase.co",
            supabase_key="anon-key",
            device_id=DEVICE_ID,
            api_key=API_KEY,
            ingest_function="ingest_readings_v2",
            interval_seconds=10,
            client=client,
            **FAST_RETRY,
        )
    )
    await asyncio.sleep(0.02)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await client.aclose()

    assert seen_url["value"] == "https://example.supabase.co/rest/v1/rpc/ingest_readings_v2"


# ---------------------------------------------------------------- sessions

SESSION_URL = "https://example.supabase.co/rest/v1/rpc/upsert_session"


def engine_with_sessions(rows: list) -> object:
    from app.models.db import Session as SessionRow

    engine = make_engine("sqlite://")
    init_db(engine)
    with DBSession(engine) as db:
        for row in rows:
            db.add(SessionRow(**row))
        db.commit()
    return engine


def base_session(**overrides) -> dict:
    fields = dict(
        session_id="session-1",
        subject_id="bench",
        suit_config="rig",
        name="Breath test",
        device_id=DEVICE_ID,
        start_time=datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc),
    )
    fields.update(overrides)
    return fields


async def test_sync_sessions_sends_this_devices_unsynced_sessions_and_marks_them():
    from app.models.db import Session as SessionRow
    from app.sync.worker import _sync_sessions_once

    engine = engine_with_sessions([
        base_session(),
        base_session(session_id="other-device", device_id="someone-else"),
        base_session(session_id="already", synced=True),
    ])
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(204)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    sent = await _sync_sessions_once(engine, client, SESSION_URL, HEADERS, device_id=DEVICE_ID, api_key=API_KEY)
    await client.aclose()

    assert sent == 1
    assert str(requests[0].url) == SESSION_URL
    body = json.loads(requests[0].content)
    assert body["p_device_id"] == DEVICE_ID and body["p_api_key"] == API_KEY
    assert body["p_session"]["session_id"] == "session-1"
    assert body["p_session"]["name"] == "Breath test"
    assert body["p_session"]["end_time"] is None
    with DBSession(engine) as db:
        assert db.get(SessionRow, "session-1").synced is True
        assert db.get(SessionRow, "other-device").synced is False


async def test_sync_sessions_failure_leaves_session_unsynced():
    from app.models.db import Session as SessionRow
    from app.sync.worker import _sync_sessions_once

    engine = engine_with_sessions([base_session()])
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404, json={})))
    try:
        await _sync_sessions_once(engine, client, SESSION_URL, HEADERS, device_id=DEVICE_ID, api_key=API_KEY)
        raised = False
    except httpx.HTTPStatusError:
        raised = True
    await client.aclose()

    assert raised
    with DBSession(engine) as db:
        assert db.get(SessionRow, "session-1").synced is False


async def test_session_stopped_during_send_stays_unsynced():
    from app.models.db import Session as SessionRow
    from app.sync.worker import _sync_sessions_once

    engine = engine_with_sessions([base_session()])

    def handler(request: httpx.Request) -> httpx.Response:
        # the session is stopped while this request is in flight
        with DBSession(engine) as db:
            row = db.get(SessionRow, "session-1")
            row.end_time = datetime(2026, 11, 15, 12, 30, tzinfo=timezone.utc)
            db.add(row)
            db.commit()
        return httpx.Response(204)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await _sync_sessions_once(engine, client, SESSION_URL, HEADERS, device_id=DEVICE_ID, api_key=API_KEY)
    await client.aclose()
    with DBSession(engine) as db:
        assert db.get(SessionRow, "session-1").synced is False


async def test_run_sync_worker_keeps_syncing_readings_when_session_sync_fails():
    engine = engine_with_readings([base_reading(seq=1)])
    from app.models.db import Session as SessionRow

    with DBSession(engine) as db:
        db.add(SessionRow(**base_session()))
        db.commit()
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/upsert_session"):
            return httpx.Response(404, json={"message": "Could not find the function"})
        return httpx.Response(200, json=1)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    task = asyncio.create_task(
        run_sync_worker(
            engine=engine, supabase_url="https://example.supabase.co", supabase_key="key",
            device_id=DEVICE_ID, api_key=API_KEY, interval_seconds=0.01, client=client,
            retry_stop=stop_after_attempt(1), retry_wait=wait_fixed(0),
        )
    )
    await asyncio.sleep(0.1)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await client.aclose()

    assert "/rest/v1/rpc/ingest_readings" in paths
    assert "/rest/v1/rpc/upsert_session" in paths
    with DBSession(engine) as db:
        assert all(r.synced for r in db.exec(select(Reading)))
