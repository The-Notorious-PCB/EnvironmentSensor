from app.broadcast import BroadcastManager


class FakeWebSocket:
    def __init__(self, fail_send: bool = False):
        self.accepted = False
        self.sent = []
        self.fail_send = fail_send

    async def accept(self):
        self.accepted = True

    async def send_text(self, message: str):
        if self.fail_send:
            raise RuntimeError("connection closed")
        self.sent.append(message)


async def test_connect_accepts_and_registers_client():
    manager = BroadcastManager()
    ws = FakeWebSocket()
    await manager.connect(ws)
    assert ws.accepted
    assert ws in manager._clients


async def test_broadcast_sends_to_all_connected_clients():
    manager = BroadcastManager()
    ws1, ws2 = FakeWebSocket(), FakeWebSocket()
    await manager.connect(ws1)
    await manager.connect(ws2)

    await manager.broadcast("hello")

    assert ws1.sent == ["hello"]
    assert ws2.sent == ["hello"]


async def test_broadcast_drops_client_whose_send_fails():
    manager = BroadcastManager()
    good, bad = FakeWebSocket(), FakeWebSocket(fail_send=True)
    await manager.connect(good)
    await manager.connect(bad)

    await manager.broadcast("hello")

    assert good.sent == ["hello"]
    assert bad not in manager._clients


async def test_disconnect_removes_client():
    manager = BroadcastManager()
    ws = FakeWebSocket()
    await manager.connect(ws)
    await manager.disconnect(ws)
    assert ws not in manager._clients
