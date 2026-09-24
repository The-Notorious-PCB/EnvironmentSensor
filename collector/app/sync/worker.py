import asyncio
import logging
from typing import List, Optional

import httpx
from sqlmodel import Session as DBSession
from sqlmodel import select
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.models.db import Reading

logger = logging.getLogger(__name__)

DEFAULT_RETRY_STOP = stop_after_attempt(5)
DEFAULT_RETRY_WAIT = wait_exponential(multiplier=1, min=1, max=30)


def _reading_payload(reading: Reading) -> dict:
    """Fields sent to Supabase. Deliberately excludes `id` (local
    autoincrement — Supabase owns its own primary key) and `synced` (local
    bookkeeping, meaningless downstream).
    """
    return {
        "session_id": reading.session_id,
        "node_id": reading.node_id,
        "sensor_type": reading.sensor_type,
        "value": reading.value,
        "unit": reading.unit,
        "timestamp": reading.timestamp.isoformat(),
        "seq": reading.seq,
    }


def _fetch_unsynced_batch(engine, limit: int) -> List[Reading]:
    with DBSession(engine) as db:
        statement = (
            select(Reading)
            .where(Reading.synced == False)  # noqa: E712 — SQLAlchemy needs `==`, not `is`
            .order_by(Reading.id)
            .limit(limit)
        )
        return list(db.exec(statement))


def _mark_synced(engine, reading_ids: List[int]) -> None:
    if not reading_ids:
        return
    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading).where(Reading.id.in_(reading_ids))))
        for row in rows:
            row.synced = True
            db.add(row)
        db.commit()


async def _post_batch(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    payload: dict,
    *,
    stop,
    wait,
) -> None:
    async for attempt in AsyncRetrying(
        stop=stop,
        wait=wait,
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    ):
        with attempt:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()


async def _sync_once(
    engine,
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    *,
    device_id: str,
    api_key: str,
    batch_size: int,
    retry_stop,
    retry_wait,
) -> int:
    """One fetch -> POST -> mark-synced cycle. Returns how many readings
    were synced (0 if there was nothing to do, or if the POST failed even
    after retries — those rows are left unsynced and picked up again next
    cycle, which is what makes intermittent connectivity survivable).

    The POST is a call to the `ingest_readings` RPC (see
    supabase/migrations and shared/device-registration.md), not a raw
    table insert — device_id/api_key go in the request body as RPC
    parameters, verified against api_key_hash inside the function. On
    success it tags every row with device_id and stamps
    sensor_arrays.last_seen_at, both server-side; nothing extra is needed
    here for either.
    """
    batch = await asyncio.to_thread(_fetch_unsynced_batch, engine, batch_size)
    if not batch:
        return 0

    payload = {
        "p_device_id": device_id,
        "p_api_key": api_key,
        "p_readings": [_reading_payload(r) for r in batch],
    }
    try:
        await _post_batch(client, url, headers, payload, stop=retry_stop, wait=retry_wait)
    except httpx.HTTPError:
        logger.exception(
            "sync: failed to push batch of %d readings after retries, will retry next cycle",
            len(batch),
        )
        return 0

    await asyncio.to_thread(_mark_synced, engine, [r.id for r in batch])
    logger.info("sync: pushed %d readings to Supabase", len(batch))
    return len(batch)


async def run_sync_worker(
    *,
    engine,
    supabase_url: str,
    supabase_key: str,
    device_id: str,
    api_key: str,
    ingest_function: str = "ingest_readings",
    interval_seconds: float = 3.0,
    batch_size: int = 500,
    client: Optional[httpx.AsyncClient] = None,
    retry_stop=DEFAULT_RETRY_STOP,
    retry_wait=DEFAULT_RETRY_WAIT,
) -> None:
    """Periodically pushes unsynced readings to Supabase via the
    `ingest_readings` RPC. Runs until cancelled. See
    shared/device-registration.md for the full device-auth flow and
    supabase/migrations for the function this calls.

    `supabase_key` is the project's **anon key**, not service-role — the
    RPC does its own authorization internally via (device_id, api_key)
    against api_key_hash, so the anon key alone doesn't grant write access
    to anything (see the migration's RLS/grants).

    `client` is injectable (an httpx.AsyncClient with a MockTransport) so
    tests never hit a real network — see tests/test_sync_worker.py.
    """
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=10.0)

    url = f"{supabase_url.rstrip('/')}/rest/v1/rpc/{ingest_function}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        # skip echoing ingest_readings' return value (a row count we don't
        # need) — a little bandwidth/latency saved every cycle, and cycles
        # are frequent (interval_seconds defaults to 3).
        "Prefer": "return=minimal",
    }

    try:
        while True:
            try:
                await _sync_once(
                    engine,
                    client,
                    url,
                    headers,
                    device_id=device_id,
                    api_key=api_key,
                    batch_size=batch_size,
                    retry_stop=retry_stop,
                    retry_wait=retry_wait,
                )
            except Exception:
                logger.exception("sync: unexpected error in sync cycle")
            await asyncio.sleep(interval_seconds)
    finally:
        if owns_client:
            await client.aclose()
