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


# Columns added after a laptop's database may already exist. create_all makes
# missing tables but never changes existing ones, so init_db adds these
# itself. Existing sessions get synced = 1: they predate session sync, and
# may belong to a different device than the one the collector now runs as.
ADDED_COLUMNS = {
    "sessions": [
        ("name", "VARCHAR"),
        ("device_id", "VARCHAR"),
        ("synced", "BOOLEAN NOT NULL DEFAULT 1"),
    ],
}


def init_db(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            have = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns:
                if name not in have:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
