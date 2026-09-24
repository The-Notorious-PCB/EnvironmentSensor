from typing import Iterator

from fastapi import Request
from sqlmodel import Session as DBSession


def get_db(request: Request) -> Iterator[DBSession]:
    engine = request.app.state.engine
    with DBSession(engine) as session:
        yield session


def get_session_manager(request: Request):
    return request.app.state.session_manager


def get_reader(request: Request):
    return request.app.state.serial_reader
