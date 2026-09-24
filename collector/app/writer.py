import asyncio
import json
import logging

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session as DBSession

from app.models.db import Reading
from app.models.packet import SensorPacket

logger = logging.getLogger(__name__)


async def run_writer(queue: "asyncio.Queue[SensorPacket]", engine, session_manager, broadcast) -> None:
    """Consumes validated packets off `queue`: stores each as a Reading tied
    to the currently active session, then broadcasts it to live WebSocket
    clients. Runs until cancelled.
    """
    while True:
        packet = await queue.get()
        try:
            await _handle_packet(packet, engine, session_manager, broadcast)
        except Exception:
            logger.exception("writer failed to handle packet: %s", packet)
        finally:
            queue.task_done()


async def _handle_packet(packet: SensorPacket, engine, session_manager, broadcast) -> None:
    session_id = session_manager.active_session_id
    if session_id is None:
        logger.debug("dropping packet, no active session: %s", packet)
        return

    inserted = await asyncio.to_thread(_insert_reading, engine, session_id, packet)
    if not inserted:
        logger.debug(
            "dropping duplicate reading (session=%s node=%s seq=%s)",
            session_id,
            packet.node_id,
            packet.seq,
        )
        return

    await broadcast.broadcast(
        json.dumps(
            {
                "session_id": session_id,
                "node_id": packet.node_id,
                "sensor_type": packet.sensor_type.value,
                "value": packet.value,
                "unit": packet.unit,
                "timestamp": packet.timestamp.isoformat(),
                "seq": packet.seq,
            }
        )
    )


def _insert_reading(engine, session_id: str, packet: SensorPacket) -> bool:
    """Runs off the event loop thread (via asyncio.to_thread) — SQLite
    commits are blocking and the writer must not stall broadcast/API
    handling while one is in flight.
    """
    with DBSession(engine) as db:
        db.add(Reading.from_packet(session_id, packet))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return False
        return True
