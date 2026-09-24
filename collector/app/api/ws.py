from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/live")
async def live_readings(websocket: WebSocket) -> None:
    broadcast = websocket.app.state.broadcast_manager
    await broadcast.connect(websocket)
    try:
        while True:
            # dashboard clients don't send anything; this just blocks until
            # the client disconnects so we notice and clean up.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await broadcast.disconnect(websocket)
