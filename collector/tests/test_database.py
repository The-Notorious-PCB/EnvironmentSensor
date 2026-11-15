import sqlite3

from sqlmodel import Session as DBSession

from app.database import init_db, make_engine
from app.models.db import Session as SessionRow


def test_init_db_adds_new_session_columns_to_an_existing_database(tmp_path):
    # A laptop database from before sessions had name/device_id/synced.
    path = tmp_path / "collector.db"
    with sqlite3.connect(path) as conn:
        conn.execute(
            "CREATE TABLE sessions (session_id VARCHAR PRIMARY KEY, subject_id VARCHAR NOT NULL, "
            "suit_config VARCHAR NOT NULL, start_time DATETIME NOT NULL, end_time DATETIME, notes VARCHAR)"
        )
        conn.execute(
            "INSERT INTO sessions VALUES ('old', 'bench', 'rig', '2026-11-01 10:00:00', "
            "'2026-11-01 11:00:00', NULL)"
        )

    engine = make_engine(f"sqlite:///{path}")
    init_db(engine)
    init_db(engine)  # running again is harmless

    with DBSession(engine) as db:
        old = db.get(SessionRow, "old")
        assert old.name is None and old.device_id is None
        # old sessions aren't sent: they predate session sync and may belong
        # to another device
        assert old.synced is True
        db.add(SessionRow(session_id="new", subject_id="b", suit_config="r", start_time=old.start_time))
        db.commit()
        assert db.get(SessionRow, "new").synced is False
