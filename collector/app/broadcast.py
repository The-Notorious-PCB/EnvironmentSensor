import asyncio
import logging

logger = logging.getLogger(__name__)


class BroadcastManager:
    """Fan-out of live readings to connected dashboard WebSocket clients.

    Takes anything with an async `send_text(str)` — a real
    starlette.websockets.WebSocket in production, a plain stub in tests.
    """

    def __init__(self) -> None:
        self._clients: set = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, message: str) -> None:
        async with self._lock:
            clients = list(self._clients)
        for client in clients:
            try:
                await client.send_text(message)
            except Exception:
                logger.debug("dropping unresponsive websocket client", exc_info=True)
                await self.disconnect(client)
