from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session as DBSession
from sqlmodel import select

from app.api.deps import get_db, get_session_manager
from app.models.db import Reading
from app.models.db import Session as SessionRow
from app.state import SessionManager

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    subject_id: str
    suit_config: str
    notes: Optional[str] = None


@router.post("", response_model=SessionRow, status_code=201)
def start_session(
    body: SessionCreate,
    db: DBSession = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
) -> SessionRow:
    if session_manager.active_session_id is not None:
        raise HTTPException(status_code=409, detail="a session is already in progress")

    session_row = SessionRow(
        subject_id=body.subject_id,
        suit_config=body.suit_config,
        notes=body.notes,
        start_time=datetime.now(timezone.utc),
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    session_manager.activate(session_row.session_id)
    return session_row


@router.post("/{session_id}/stop", response_model=SessionRow)
def stop_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    session_manager: SessionManager = Depends(get_session_manager),
) -> SessionRow:
    session_row = db.get(SessionRow, session_id)
    if session_row is None:
        raise HTTPException(status_code=404, detail="session not found")

    if session_row.end_time is None:
        session_row.end_time = datetime.now(timezone.utc)
        db.add(session_row)
        db.commit()
        db.refresh(session_row)

    session_manager.deactivate(session_id)
    return session_row


@router.get("", response_model=List[SessionRow])
def list_sessions(db: DBSession = Depends(get_db)) -> List[SessionRow]:
    return list(db.exec(select(SessionRow).order_by(SessionRow.start_time.desc())))


@router.get("/{session_id}/readings", response_model=List[Reading])
def get_session_readings(
    session_id: str,
    limit: int = Query(default=5000, le=20000),
    offset: int = Query(default=0, ge=0),
    db: DBSession = Depends(get_db),
) -> List[Reading]:
    session_row = db.get(SessionRow, session_id)
    if session_row is None:
        raise HTTPException(status_code=404, detail="session not found")

    statement = (
        select(Reading)
        .where(Reading.session_id == session_id)
        .order_by(Reading.timestamp)
        .offset(offset)
        .limit(limit)
    )
    return list(db.exec(statement))
