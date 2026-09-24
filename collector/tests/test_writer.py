import asyncio
import contextlib
import json
from datetime import datetime, timezone

import pytest
from sqlmodel import Session as DBSession
from sqlmodel import select

from app.database import init_db, make_engine
from app.models.db import Reading
from app.models.packet import SensorPacket
from app.state import SessionManager
from app.writer import run_writer


class RecordingBroadcast:
    def __init__(self):
        self.messages = []

    async def broadcast(self, message):
        self.messages.append(message)


def make_packet(**overrides) -> SensorPacket:
    fields = dict(
        node_id="helmet-01",
        sensor_type="co2",
        value=800.0,
        unit="ppm",
        timestamp=datetime.now(timezone.utc),
        seq=1,
        crc16="abcd",
    )
    fields.update(overrides)
    return SensorPacket(**fields)


@pytest.fixture
async def running_writer():
    engine = make_engine("sqlite://")
    init_db(engine)
    session_manager = SessionManager()
    broadcast = RecordingBroadcast()
    queue: asyncio.Queue = asyncio.Queue()

    task = asyncio.create_task(run_writer(queue, engine, session_manager, broadcast))
    yield engine, session_manager, broadcast, queue

    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


async def test_writer_stores_and_broadcasts_when_session_active(running_writer):
    engine, session_manager, broadcast, queue = running_writer
    session_manager.activate("session-1")

    await queue.put(make_packet(seq=1))
    await asyncio.wait_for(queue.join(), timeout=1)

    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert len(rows) == 1
    assert rows[0].session_id == "session-1"
    assert rows[0].sensor_type == "co2"

    assert len(broadcast.messages) == 1
    payload = json.loads(broadcast.messages[0])
    assert payload["session_id"] == "session-1"
    assert payload["seq"] == 1


async def test_writer_drops_packet_when_no_active_session(running_writer):
    engine, session_manager, broadcast, queue = running_writer

    await queue.put(make_packet(seq=1))
    await asyncio.wait_for(queue.join(), timeout=1)

    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert rows == []
    assert broadcast.messages == []


async def test_writer_deduplicates_replayed_packet(running_writer):
    engine, session_manager, broadcast, queue = running_writer
    session_manager.activate("session-1")

    await queue.put(make_packet(seq=1))
    await queue.put(make_packet(seq=1))
    await asyncio.wait_for(queue.join(), timeout=1)

    with DBSession(engine) as db:
        rows = list(db.exec(select(Reading)))
    assert len(rows) == 1
    assert len(broadcast.messages) == 1
