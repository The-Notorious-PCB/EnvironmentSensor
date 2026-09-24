from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine


def make_engine(database_url: str) -> Engine:
    """SQLite needs check_same_thread=False since the writer task, API
    request handlers, and (via TestClient) test code all use the engine
    from different threads. In-memory URLs (`sqlite://`, `sqlite:///:memory:`)
    need StaticPool too, or each new connection would get its own empty
    in-memory DB instead of sharing one.
    """
    connect_args: dict = {}
    kwargs: dict = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if ":memory:" in database_url or database_url == "sqlite://":
            kwargs["poolclass"] = StaticPool
    return create_engine(database_url, connect_args=connect_args, **kwargs)


def init_db(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)
