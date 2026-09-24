from fastapi import APIRouter, Depends

from app.api.deps import get_reader, get_session_manager

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session_manager=Depends(get_session_manager), reader=Depends(get_reader)):
    return {
        "status": "ok",
        "active_session_id": session_manager.active_session_id,
        "serial": dict(reader.stats) if reader is not None else None,
    }
